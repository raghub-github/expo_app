import { AppText as Text } from "@/components/AppText";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { PREP_DELAY_OPTIONS } from "@/lib/order-prep-time";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSelectMinutes: (minutes: number) => void;
};

export function MerchantPrepDelaySheet({
  visible,
  loading,
  onClose,
  onSelectMinutes,
}: Props) {
  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="52%">
      <View style={styles.body}>
        <Text style={styles.title}>Mark delay in this order</Text>
        <Text style={styles.subtitle}>How much more time do you need?</Text>
        <Text style={styles.hint}>The same will be shown to the customer.</Text>

        <View style={styles.optionsRow}>
          {PREP_DELAY_OPTIONS.map((mins) => (
            <Pressable
              key={mins}
              disabled={loading}
              onPress={() => onSelectMinutes(mins)}
              style={({ pressed }) => [
                styles.optionBtn,
                loading && styles.optionBtnDisabled,
                pressed && !loading && styles.pressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={GatiMitraMerchant.primary} />
              ) : (
                <Text style={styles.optionText}>{mins} mins</Text>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 8,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  optionBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: CARD_RADIUS,
    borderWidth: 2,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  optionBtnDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.88 },
  optionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
  },
});
