import { Pressable, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CheckoutPaymentMethodLogo } from "@/components/checkout/CheckoutPaymentMethodLogo";
import { payInstrumentShortLabel, type CheckoutPayMethodItem } from "@/lib/razorpayPaymentMethods";
import { StoreFonts } from "@/constants/storeTypography";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

type Props = {
  instrument: CheckoutPayMethodItem;
  onPress: () => void;
};

export function CheckoutPayUsingButton({ instrument, onPress }: Props) {
  const dark = useMerchantUiDark();
  const label = payInstrumentShortLabel(instrument);
  const muted = dark ? MerchantDarkPalette.textMuted : "#6B7280";
  const title = dark ? MerchantDarkPalette.text : "#111827";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pay using ${label}`}
      style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <View style={styles.logoWrap} pointerEvents="none">
          <CheckoutPaymentMethodLogo logoKey={instrument.logoKey} size={28} />
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
  row: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    width: "100%",
  },
  logoWrap: {
    width: 28,
    height: 28,
    backgroundColor: "transparent",
    borderWidth: 0,
    overflow: "visible",
    elevation: 0,
    shadowOpacity: 0,
    shadowColor: "transparent",
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
