import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import type { FoodOrderRiderLogEntry } from "@/services/ordersApi";
import { RiderSelfieAvatar } from "@/components/order/RiderSelfieAvatar";
import { RiderSelfieViewerModal } from "@/components/order/RiderSelfieViewerModal";
import { GatiMitraMerchant, CARD_RADIUS, CARD_PADDING, FONT_SECONDARY } from "@/constants/theme";

type Props = {
  rider: FoodOrderRiderLogEntry | null;
  deliveryType: string;
  riderReachedAt?: string | null;
};

function riderStatusLabel(rider: FoodOrderRiderLogEntry | null, reachedAt?: string | null): string {
  if (!rider) {
    return "Assigning delivery partner…";
  }
  if (rider.delivered_at) return "Delivered by rider";
  if (rider.picked_up_at) return "Out for delivery";
  if (reachedAt || rider.reached_merchant_at) return "Rider at store";
  if (rider.accepted_at) return "Rider on the way";
  if (rider.assigned_at) return "Rider assigned";
  return "Delivery partner";
}

export function OrderDetailRiderCard({ rider, deliveryType, riderReachedAt }: Props) {
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const isGatiMitra = String(deliveryType).toUpperCase() === "GATIMITRA_RIDER";
  if (!isGatiMitra) return null;

  const status = riderStatusLabel(rider, riderReachedAt);
  const name = (rider?.rider_name ?? "").trim() || "Delivery partner";
  const mobile = (rider?.rider_mobile ?? "").trim();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Delivery partner</Text>
      <View style={styles.row}>
        <RiderSelfieAvatar
          selfieUrl={rider?.selfie_url}
          riderName={name}
          size={44}
          onPress={() => setSelfieModalOpen(true)}
        />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.status}>{status}</Text>
        </View>
        {mobile ? (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${mobile}`)}
            style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
            accessibilityLabel={`Call ${name}`}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>

      <RiderSelfieViewerModal
        visible={selfieModalOpen}
        imageUrl={rider?.selfie_url ?? null}
        riderName={name}
        onClose={() => setSelfieModalOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 0,
    marginTop: 14,
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  status: {
    fontSize: FONT_SECONDARY,
    color: GatiMitraMerchant.textSecondary,
  },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
});
