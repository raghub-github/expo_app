import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import type { StoreOrderRating } from "@/hooks/useOrders";

const STAR_ON = "#F59E0B";
const STAR_OFF = "#D1D5DB";

type Props = {
  rating: StoreOrderRating;
  onPress?: () => void;
};

export function MerchantOrderRatingBlock({ rating, onPress }: Props) {
  const stars = Math.min(5, Math.max(0, Math.round(rating.rating)));
  const reviewText = rating.reviewText?.trim() || rating.reviewTitle?.trim() || "";

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation?.();
        onPress?.();
      }}
      disabled={!onPress}
      style={({ pressed }) => [styles.wrap, pressed && onPress ? styles.pressed : null]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? "Open customer review" : "Customer rating"}
    >
      <View style={styles.row}>
        <Text style={styles.label}>Rating</Text>
        <View style={styles.stars}>
          {Array.from({ length: 5 }).map((_, idx) => (
            <Ionicons
              key={idx}
              name="star"
              size={16}
              color={idx < stars ? STAR_ON : STAR_OFF}
            />
          ))}
        </View>
      </View>
      {reviewText ? (
        <View style={styles.reviewRow}>
          <Text style={styles.reviewText} numberOfLines={2}>
            {reviewText}
          </Text>
          {onPress ? (
            <Ionicons name="arrow-forward" size={16} color="#6B7280" />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  stars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  reviewText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    textAlign: "center",
  },
});
