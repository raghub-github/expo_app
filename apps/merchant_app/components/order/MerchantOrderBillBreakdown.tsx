import { View, Text } from "react-native";
import type { OrderRecord } from "@/hooks/useOrders";
import { getMerchantOrderCardBillLines } from "@/lib/merchantOrderCardBillSummary";
import { formatMerchantRs } from "@/lib/merchant-line-total";
import { merchantOrderCardLayoutStyles as styles } from "@/components/order/merchantOrderCardLayoutStyles";

type Props = {
  order: OrderRecord;
};

function BillSummaryRow({
  label,
  amount,
  discount,
  dotted,
}: {
  label: string;
  amount: number;
  discount?: boolean;
  dotted?: boolean;
}) {
  return (
    <View style={styles.billSummaryRow}>
      <Text
        style={[styles.billSummaryLabel, dotted && styles.billSummaryLabelDotted]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text style={[styles.billSummaryAmount, discount && styles.billSummaryDiscount]}>
        {discount ? `−${formatMerchantRs(amount)}` : formatMerchantRs(amount)}
      </Text>
    </View>
  );
}

export function MerchantOrderBillBreakdown({ order }: Props) {
  const lines = getMerchantOrderCardBillLines(order);

  return (
    <View style={styles.billBreakdown}>
      {lines.map((line) => (
        <BillSummaryRow
          key={line.key}
          label={line.label}
          amount={line.amount}
          discount={line.kind === "discount"}
          dotted={line.kind === "tax"}
        />
      ))}
    </View>
  );
}
