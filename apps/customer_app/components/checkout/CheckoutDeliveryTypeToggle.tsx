import { useEffect, useRef, useState } from "react";
import { View, TouchableOpacity, StyleSheet, Pressable } from "react-native";
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
  const prevRef = useRef(value);
  const [showTakeawayTip, setShowTakeawayTip] = useState(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev !== "self_pickup" && value === "self_pickup") {
      setShowTakeawayTip(true);
      const t = setTimeout(() => setShowTakeawayTip(false), 4200);
      return () => clearTimeout(t);
    }
    if (value !== "self_pickup") {
      setShowTakeawayTip(false);
    }
  }, [value]);

  return (
    <View style={styles.wrap}>
      {showTakeawayTip ? (
        <Pressable
          style={[styles.tipBubble, dark && styles.tipBubbleDark]}
          onPress={() => setShowTakeawayTip(false)}
          accessibilityRole="text"
          accessibilityLabel="This is a takeaway order, you will have to visit this outlet to pickup this order"
        >
          <CheckoutText style={[styles.tipText, dark && styles.tipTextDark]}>
            This is a takeaway order, you will have to visit this outlet to pickup this order!
          </CheckoutText>
          <View style={[styles.tipArrow, dark && styles.tipArrowDark]} />
        </Pressable>
      ) : null}

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
              name="shopping"
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    width: WIDTH,
    overflow: "visible",
    zIndex: 20,
  },
  tipBubble: {
    position: "absolute",
    right: -4,
    bottom: 56,
    width: 210,
    backgroundColor: "#2A2A2A",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  tipBubbleDark: {
    backgroundColor: "#3A3A3A",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MerchantDarkPalette.border,
  },
  tipText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
    textAlign: "center",
  },
  tipTextDark: {
    color: "#F3F4F6",
  },
  tipArrow: {
    position: "absolute",
    right: 28,
    bottom: -6,
    width: 12,
    height: 12,
    backgroundColor: "#2A2A2A",
    transform: [{ rotate: "45deg" }],
  },
  tipArrowDark: {
    backgroundColor: "#3A3A3A",
  },
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
