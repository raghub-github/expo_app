import { useMemo } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { resolveMerchantInstructionsForDisplay } from "@/lib/merchant-order-instructions";

type Props = {
  merchantInstructionsList?: unknown;
  requiresUtensils?: boolean | null;
  style?: object;
};

export function OrderCardMerchantInstructions({
  merchantInstructionsList,
  requiresUtensils,
  style,
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
    <View style={[styles.instructionsRow, style]}>
      <Ionicons name="clipboard-outline" size={14} color="#B45309" />
      <Text style={styles.instructionsText} numberOfLines={3}>
        {lines.join(" · ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  instructionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  instructionsText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#92400E",
    lineHeight: 15,
  },
});
