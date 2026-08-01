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
  /** Inside a bordered card — skip the top hairline divider. */
  embedded?: boolean;
};

export function formatPendingRiderHeadline(nearbyCount: number, message?: string): string {
  if (message?.trim()) return message.trim();
  if (nearbyCount <= 0) return "Looking for nearby riders, assigning one soon";
  if (nearbyCount === 1) return "1 rider nearby, assigning one soon";
  return `${nearbyCount} riders nearby, assigning one soon`;
}

export function RiderAssignPendingCard({
  summary,
  statusSubtitle,
  embedded = false,
}: Props) {
  const nearbyCount = summary?.nearbyCount ?? 0;
  const headline = formatPendingRiderHeadline(nearbyCount, summary?.assignSoonMessage);

  return (
    <View style={[styles.row, embedded ? styles.rowEmbedded : null]}>
      <View style={styles.cluster}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rowEmbedded: {
    borderTopWidth: 0,
  },
  cluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    maxWidth: "100%",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
    alignItems: "center",
  },
  headline: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 18,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
    textAlign: "center",
  },
});
