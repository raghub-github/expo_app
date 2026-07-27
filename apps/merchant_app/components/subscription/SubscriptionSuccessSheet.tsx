/**
 * Post-payment / already-on-plan congratulations sheet.
 * Same scooped header shell as Confirm subscription.
 */
import { AppText as Text } from "@/components/AppText";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { GatiMitraMerchant } from "@/constants/theme";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";

export type SubscriptionSuccessSheetProps = {
  visible: boolean;
  planName: string;
  /** "purchased" after pay · "already" when already on this plan */
  mode?: "purchased" | "already";
  via?: "wallet" | "razorpay" | "skipped" | null;
  billingCycleLabel?: string | null;
  onClose: () => void;
};

export function SubscriptionSuccessSheet({
  visible,
  planName,
  mode = "purchased",
  via = null,
  billingCycleLabel: cycleLabel,
  onClose,
}: SubscriptionSuccessSheetProps) {
  const isAlready = mode === "already";
  const viaLine =
    via === "wallet"
      ? "Paid from your store wallet."
      : via === "razorpay"
        ? "Payment received successfully via Razorpay."
        : via === "skipped"
          ? "No payment was required."
          : null;

  return (
    <PermissionBottomSheetShell
      visible={visible}
      dismissible
      onDismiss={onClose}
      maxHeightRatio={0.68}
    >
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ width: 40 }} />
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#64748B" />
          </Pressable>
        </View>

        <View style={[styles.iconWrap, isAlready && styles.iconWrapAlready]}>
          <Ionicons
            name={isAlready ? "ribbon" : "checkmark-circle"}
            size={44}
            color={GatiMitraMerchant.primary}
          />
        </View>

        <Text style={styles.title}>
          {isAlready ? "Congratulations!" : "Payment successful!"}
        </Text>
        <Text style={styles.subtitle}>
          {isAlready ? "You're all set" : "Plan purchased successfully"}
        </Text>
        <Text style={styles.body}>
          {isAlready
            ? `You're already on ${planName}. Enjoy your subscription benefits.`
            : `${planName} is now active on this store. You can manage auto-renew and billing from this screen anytime.`}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Active plan</Text>
          <Text style={styles.cardPlan}>{planName}</Text>
          {cycleLabel ? <Text style={styles.cardCycle}>{cycleLabel}</Text> : null}
          {viaLine ? <Text style={styles.cardVia}>{viaLine}</Text> : null}
        </View>

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.btnText}>Done</Text>
        </Pressable>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 8,
    alignItems: "center",
  },
  headerRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: "rgba(62, 180, 137, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  iconWrapAlready: {
    backgroundColor: "rgba(13, 148, 136, 0.16)",
  },
  title: {
    fontSize: 26,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: POPPINS_BOLD,
    color: GatiMitraMerchant.primary,
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    fontFamily: LORA,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
    marginBottom: 18,
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: "#F0FDFA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 20,
    alignItems: "center",
  },
  cardLabel: {
    fontSize: 11,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.primary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  cardPlan: {
    fontSize: 18,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    textAlign: "center",
  },
  cardCycle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: LORA,
    color: "#64748B",
  },
  cardVia: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: LORA,
    color: "#0F766E",
  },
  btn: {
    alignSelf: "stretch",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnPressed: { opacity: 0.9 },
  btnText: {
    color: "#FFFFFF",
    fontFamily: LORA_BOLD,
    fontSize: 16,
  },
});
