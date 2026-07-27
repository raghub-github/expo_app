import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

export type NearbyDispatchRiderSummary = {
  nearbyCount: number;
  radiusKm: number;
  assignSoonMessage: string;
};

type Props = {
  summary: NearbyDispatchRiderSummary | null;
  statusSubtitle?: string | null;
};

export function formatPendingRiderHeadline(nearbyCount: number, message?: string): string {
  if (message?.trim()) return message.trim();
  if (nearbyCount <= 0) return "Looking for nearby riders, assigning one soon";
  if (nearbyCount === 1) return "1 rider nearby, assigning one soon";
  return `${nearbyCount} riders nearby, assigning one soon`;
}

export function RiderAssignPendingCard({ summary, statusSubtitle }: Props) {
  const nearbyCount = summary?.nearbyCount ?? 0;
  const headline = formatPendingRiderHeadline(nearbyCount, summary?.assignSoonMessage);

  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name="bicycle" size={18} color="#888888" />
      </View>
      <View style={styles.body}>
        <Text style={styles.headline} numberOfLines={2}>
          {headline}
        </Text>
        {statusSubtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {statusSubtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headline: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
  },
});
