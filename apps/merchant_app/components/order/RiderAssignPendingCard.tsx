import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

export type NearbyDispatchRiderSummary = {
  nearbyCount: number;
  radiusKm: number;
  assignSoonMessage: string;
};

type Props = {
  summary: NearbyDispatchRiderSummary | null;
};

export function RiderAssignPendingCard({ summary }: Props) {
  const nearbyCount = summary?.nearbyCount ?? 0;
  const assignSoonMessage =
    summary?.assignSoonMessage ?? "Looking for nearby riders — we will assign one soon";
  const radiusKm = summary?.radiusKm;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>Delivery partner</Text>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="bicycle" size={28} color="#0284C7" />
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{nearbyCount > 99 ? "99+" : nearbyCount}</Text>
          </View>
        </View>
        <Text style={styles.title}>{assignSoonMessage}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="radio-outline" size={14} color="#10B981" />
          <Text style={styles.metaText}>
            {nearbyCount} active rider{nearbyCount === 1 ? "" : "s"} nearby
            {radiusKm != null && radiusKm > 0 ? ` · within ${radiusKm} km` : ""}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#BAE6FD",
    backgroundColor: "#F0F9FF",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#0369A1",
    backgroundColor: "#E0F2FE",
  },
  body: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  iconWrap: {
    position: "relative",
    marginBottom: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#E0F2FE",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  metaText: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    flexShrink: 1,
  },
});
