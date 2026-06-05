import { View, Text, StyleSheet, Pressable, Image, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FoodOrderRiderLogEntry } from "@/services/ordersApi";
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
  const isGatiMitra = String(deliveryType).toUpperCase() === "GATIMITRA_RIDER";
  if (!isGatiMitra) return null;

  const status = riderStatusLabel(rider, riderReachedAt);
  const name = (rider?.rider_name ?? "").trim() || "Delivery partner";
  const mobile = (rider?.rider_mobile ?? "").trim();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Delivery partner</Text>
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {rider?.selfie_url ? (
            <Image source={{ uri: rider.selfie_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="bicycle" size={18} color="#64748B" />
            </View>
          )}
        </View>
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
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  avatarImage: {
    width: 44,
    height: 44,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
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
