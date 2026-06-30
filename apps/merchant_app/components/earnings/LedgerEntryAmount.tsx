import { View, Text, StyleSheet } from "react-native";

export type CancellationLedgerDisplay = {
  originalAmount: number;
  creditAmount: number;
  showCancelledStatus: boolean;
};

type Props = {
  display: CancellationLedgerDisplay;
  formatCurrency: (amount: number) => string;
};

export function LedgerEntryAmount({ display, formatCurrency }: Props) {
  const { originalAmount, creditAmount } = display;
  const showStrike =
    originalAmount > 0 && (creditAmount <= 0 || originalAmount > creditAmount);

  return (
    <View style={styles.col}>
      {showStrike ? (
        <Text style={styles.strike}>{formatCurrency(originalAmount)}</Text>
      ) : null}
      <Text style={[styles.amount, creditAmount > 0 ? styles.credit : styles.zero]}>
        {creditAmount > 0 ? `+${formatCurrency(creditAmount)}` : formatCurrency(0)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: "flex-end" },
  strike: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9ca3af",
    textDecorationLine: "line-through",
  },
  amount: { fontSize: 15, fontWeight: "700" },
  credit: { color: "#16a34a" },
  zero: { color: "#6b7280" },
});
