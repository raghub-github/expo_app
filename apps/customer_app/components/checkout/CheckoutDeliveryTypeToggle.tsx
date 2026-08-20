import { View, TouchableOpacity, StyleSheet } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

const ACTIVE = "#137243";
const WIDTH = 118;

export type CheckoutDeliveryType = "delivery" | "self_pickup";

type Props = {
  value: CheckoutDeliveryType;
  onChange: (next: CheckoutDeliveryType) => void;
};

export function CheckoutDeliveryTypeToggle({ value, onChange }: Props) {
  const dark = useMerchantUiDark();
  return (
    <View style={[styles.shell, dark && styles.shellDark]}>
      <TouchableOpacity
        style={[styles.segHit, value === "delivery" && styles.segActive]}
        onPress={() => onChange("delivery")}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityState={{ selected: value === "delivery" }}
        accessibilityLabel="Delivery"
      >
        <View style={styles.segInner}>
          <MaterialCommunityIcons
            name="motorbike"
            size={16}
            color={value === "delivery" ? "#FFFFFF" : dark ? MerchantDarkPalette.text : "#111111"}
          />
          <CheckoutText
            style={[
              styles.segText,
              dark && styles.segTextDark,
              value === "delivery" && styles.segTextActive,
            ]}
          >
            Delivery
          </CheckoutText>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.segHit, value === "self_pickup" && styles.segActive]}
        onPress={() => onChange("self_pickup")}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityState={{ selected: value === "self_pickup" }}
        accessibilityLabel="Takeaway"
      >
        <View style={styles.segInner}>
          <MaterialCommunityIcons
            name="shopping-outline"
            size={16}
            color={value === "self_pickup" ? "#FFFFFF" : dark ? MerchantDarkPalette.text : "#111111"}
          />
          <CheckoutText
            style={[
              styles.segText,
              dark && styles.segTextDark,
              value === "self_pickup" && styles.segTextActive,
            ]}
          >
            Takeaway
          </CheckoutText>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: WIDTH,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(19, 114, 67, 0.38)",
    padding: 3,
    overflow: "hidden",
    flexShrink: 0,
  },
  shellDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.border,
  },
  /** Hit target only — NativeWind wrap-jsx crashes if flexDirection lives on TouchableOpacity. */
  segHit: {
    flex: 1,
    minWidth: 0,
    borderRadius: 9,
    overflow: "hidden",
  },
  segInner: {
    flexGrow: 1,
    minWidth: 0,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: 1,
    gap: 1,
  },
  segActive: {
    backgroundColor: ACTIVE,
  },
  segText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.1,
  },
  segTextDark: {
    color: MerchantDarkPalette.text,
  },
  segTextActive: {
    color: "#FFFFFF",
  },
});
