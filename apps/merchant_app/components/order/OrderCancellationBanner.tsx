import { View, Text, StyleSheet } from "react-native";
import { merchantCancellationDisplay } from "@/lib/merchant-cancellation-display";
import { GatiMitraMerchant, CARD_RADIUS, CARD_PADDING } from "@/constants/theme";

type Props = {
  rejectedReason?: string | null;
  cancelledByLabel?: string | null;
  cancelledByType?: string | null;
  cancelledAt?: string | null;
  orderStatus?: string | null;
};

export function OrderCancellationBanner({
  rejectedReason,
  cancelledByLabel,
  cancelledByType,
  cancelledAt,
  orderStatus,
}: Props) {
  const status = (orderStatus ?? "").toUpperCase();
  if (
    !rejectedReason?.trim() &&
    !cancelledByLabel?.trim() &&
    !cancelledByType?.trim() &&
    status !== "CANCELLED"
  ) {
    return null;
  }

  const { headline, detail } = merchantCancellationDisplay({
    rejected_reason: rejectedReason,
    cancelled_by_label: cancelledByLabel,
  });

  let meta = "";
  if (cancelledByType?.trim()) {
    meta = cancelledByType.trim();
    if (cancelledAt) {
      try {
        meta += ` • ${new Date(cancelledAt).toLocaleString("en-IN")}`;
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>CANCELLATION</Text>
      {headline ? <Text style={styles.headline}>{headline}</Text> : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: CARD_PADDING,
  },
  heading: {
    fontSize: 10,
    fontWeight: "700",
    color: "#DC2626",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  headline: {
    fontSize: 14,
    fontWeight: "600",
    color: "#991B1B",
    lineHeight: 20,
  },
  detail: {
    fontSize: 12,
    color: "#B91C1C",
    marginTop: 4,
    lineHeight: 18,
  },
  meta: {
    fontSize: 10,
    color: "#B91C1C",
    marginTop: 8,
    textTransform: "capitalize",
  },
});
