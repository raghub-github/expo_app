/**
 * Pending GatiCash credit from missed-offer unlock — user can remove before placing order.
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const BRAND = GatiMitraColors.splashMint;

type Props = {
  amountInr: number;
  offerTitle: string;
  offerSavingsInr: number;
  onRemove: () => void;
};

function formatInr(value: number): string {
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(2);
}

export function CheckoutPendingWalletCreditCard({
  amountInr,
  offerTitle,
  offerSavingsInr,
  onRemove,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="wallet-plus-outline" size={22} color={BRAND} />
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>
            {offerTitle} unlocked · save ₹{formatInr(offerSavingsInr)} today
          </Text>
          <Text style={styles.sub}>
            ₹{formatInr(amountInr)} will be added to your GatiCash wallet after order
          </Text>
        </View>

        <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={6}>
          <Text style={styles.removeBtnText}>REMOVE</Text>
        </Pressable>
      </View>

      <View style={styles.keepRow}>
        <Ionicons name="checkmark-circle" size={16} color={BRAND} />
        <Text style={styles.keepText}>Offer discount applied on this bill · wallet credit after order</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 14, fontWeight: "800", color: "#0F172A", lineHeight: 19 },
  sub: { fontSize: 12, color: "#475569", lineHeight: 16 },
  removeBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
    alignSelf: "center",
    flexShrink: 0,
  },
  removeBtnText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  keepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  keepText: { fontSize: 11, color: "#64748B", flex: 1 },
});
