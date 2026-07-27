import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";
import {
  formatCurrency,
  type LedgerAmountDisplay,
} from "@/lib/merchantPayoutUtils";

const ACCENT = {
  credit: "#16A34A",
  debit: "#DC2626",
  neutral: GatiMitraMerchant.textSecondary,
} as const;

type Props = {
  display: LedgerAmountDisplay;
};

export function LedgerEntryAmount({ display }: Props) {
  if (display.compensationPolicy) {
    const { orderCtm, receivedAmount } = display.compensationPolicy;
    const accent = receivedAmount > 0 ? ACCENT.credit : ACCENT.neutral;
    return (
      <View style={s.col}>
        <Text style={[s.ctmStrike, { color: GatiMitraMerchant.textSecondary }]}>
          {formatCurrency(orderCtm)}
        </Text>
        <Text style={[s.amount, { color: accent }]}>
          {receivedAmount > 0 ? `+${formatCurrency(receivedAmount)}` : formatCurrency(0)}
        </Text>
      </View>
    );
  }

  return (
    <Text style={[s.amount, { color: ACCENT[display.accent] }]}>
      {display.text}
    </Text>
  );
}

const s = StyleSheet.create({
  col: { alignItems: "flex-end" },
  ctmStrike: {
    fontSize: 12,
    fontWeight: "500",
    textDecorationLine: "line-through",
    marginBottom: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
