import { Pressable, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreFonts } from "@/constants/storeTypography";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  /** Opens the in-app Payment options sheet (Intent / QR / apps / cards). */
  onPress: () => void;
  disabled?: boolean;
  /** Last selected instrument short label. */
  methodLabel?: string | null;
};

/**
 * Footer "Pay using" — opens GatiMitra payment options (Razorpay-backed).
 */
export function CheckoutPayUsingButton({ onPress, disabled, methodLabel }: Props) {
  const dark = useMerchantUiDark();
  const muted = dark ? MerchantDarkPalette.textMuted : "#6B7280";
  const title = dark ? MerchantDarkPalette.text : "#111827";
  const label = methodLabel?.trim() || "UPI, Cards & more";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Pay using ${label}`}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={styles.row}>
        <View style={[styles.logoWrap, dark && styles.logoWrapDark]} pointerEvents="none">
          <Ionicons name="card-outline" size={18} color={GatiMitraColors.deepMintStart} />
        </View>
        <View style={styles.textCol}>
          <View style={styles.captionRow}>
            <Text style={[styles.caption, { color: muted }]} numberOfLines={1}>
              PAY USING
            </Text>
            <Ionicons name="caret-up" size={10} color={muted} />
          </View>
          <Text style={[styles.method, { color: title }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: "100%",
    justifyContent: "center",
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  row: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    width: "100%",
  },
  logoWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  logoWrapDark: {
    backgroundColor: "rgba(22, 163, 74, 0.18)",
    borderColor: "rgba(134, 239, 172, 0.35)",
  },
  textCol: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 8,
    justifyContent: "center",
  },
  captionRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
  },
  caption: {
    fontSize: 9,
    fontFamily: StoreFonts.poppinsBold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginRight: 2,
    lineHeight: 12,
    includeFontPadding: false,
  },
  method: {
    fontSize: 13,
    fontFamily: StoreFonts.loraBold,
    marginTop: 1,
    lineHeight: 16,
    includeFontPadding: false,
  },
});
