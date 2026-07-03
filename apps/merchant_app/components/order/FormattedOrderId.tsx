import { View, Text, StyleSheet, Platform } from "react-native";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";

type Props = {
  formattedOrderId?: string | null;
  fallbackCoreId: number;
  fallbackFoodId?: number;
  /** Incoming modal hero */
  size?: "md" | "lg";
  /** Show leading # (Partner Site cards) */
  showHash?: boolean;
};

const LAST4_SIZES_MD = [14, 15, 16, 17];
const LAST4_SIZES_LG = [18, 19, 20, 21];

/** Partner Site `FormattedOrderId` — prefix dark + orange last 4 digits. */
export function FormattedOrderId({
  formattedOrderId,
  fallbackCoreId,
  fallbackFoodId,
  size = "lg",
  showHash = false,
}: Props) {
  const display = formatOrderIdDisplay(formattedOrderId, fallbackCoreId, fallbackFoodId);
  const isLg = size === "lg";
  const last4Sizes = isLg ? LAST4_SIZES_LG : LAST4_SIZES_MD;

  if (display.length > 4) {
    const prefix = display.slice(0, -4);
    const last4 = display.slice(-4);
    return (
      <View style={[styles.row, isLg ? styles.rowLg : styles.rowMd]}>
        {showHash ? (
          <Text style={[styles.hash, isLg ? styles.prefixLg : styles.prefixMd]}>#</Text>
        ) : null}
        <Text style={[styles.prefix, isLg ? styles.prefixLg : styles.prefixMd]}>{prefix}</Text>
        <View style={styles.last4Row}>
          {last4.split("").map((digit, idx) => (
            <Text
              key={`${digit}-${idx}`}
              style={[
                styles.last4Digit,
                { fontSize: last4Sizes[idx] ?? last4Sizes[last4Sizes.length - 1] },
              ]}
            >
              {digit}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  const fallback = display || "ORDER";
  return (
    <View style={styles.row}>
      {showHash && display ? (
        <Text style={[styles.hash, isLg ? styles.prefixLg : styles.prefixMd]}>#</Text>
      ) : null}
      <Text style={[styles.fallback, isLg ? styles.prefixLg : styles.prefixMd]}>{fallback}</Text>
    </View>
  );
}

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 1,
    flexWrap: "wrap",
  },
  rowLg: { gap: 1 },
  rowMd: { gap: 0 },
  hash: {
    fontWeight: "800",
    color: "#111827",
    fontFamily: mono,
  },
  prefix: {
    fontWeight: "800",
    color: "#111827",
    fontFamily: mono,
    letterSpacing: 0.3,
  },
  prefixLg: { fontSize: 20, lineHeight: 24 },
  prefixMd: { fontSize: 17, lineHeight: 21 },
  last4Row: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  last4Digit: {
    fontWeight: "800",
    color: "#EA580C",
    fontFamily: mono,
    letterSpacing: 0.2,
  },
  fallback: {
    fontWeight: "800",
    color: "#111827",
    fontFamily: mono,
  },
});
