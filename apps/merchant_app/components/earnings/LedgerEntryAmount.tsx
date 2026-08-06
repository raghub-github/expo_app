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
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const showStrike =
      round2(orderCtm) > 0 && Math.abs(round2(orderCtm) - round2(receivedAmount)) > 0.005;
    const accent = receivedAmount > 0 ? ACCENT.credit : ACCENT.neutral;
    return (
      <View style={s.col}>
        {showStrike ? (
          <Text style={[s.ctmStrike, { color: GatiMitraMerchant.textSecondary }]}>
            {formatCurrency(orderCtm)}
          </Text>
        ) : null}
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
