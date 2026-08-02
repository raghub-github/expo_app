/**
 * Order-level kitchen instructions — sits directly under Item details (Partner Site / Zomato layout).
 */

import { useMemo } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { resolveMerchantInstructionsForDisplay } from "@/lib/merchant-order-instructions";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  merchantInstructionsList?: unknown;
  requiresUtensils?: boolean | null;
};

export function OrderDetailInstructionsSection({
  merchantInstructionsList,
  requiresUtensils,
}: Props) {
  const lines = useMemo(
    () =>
      resolveMerchantInstructionsForDisplay({
        merchant_instructions_list: merchantInstructionsList,
        requires_utensils: requiresUtensils,
      }),
    [merchantInstructionsList, requiresUtensils]
  );

  if (lines.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Order instructions</Text>
      <View style={styles.card}>
        <Text style={styles.body}>{lines.join("\n")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
  },
  heading: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#F5F3FF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E9E5FF",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  body: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4C1D95",
    lineHeight: 20,
  },
});
