import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG } from "@/lib/foodHomeLayout";

type Props = {
  enabled: boolean;
  message: string;
  backgroundColor?: string;
};

function gradientColors(base: string): [string, string, string] {
  return [base, base, base];
}

export function FoodHomeGoldStrip({
  enabled,
  message,
  backgroundColor = DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG,
}: Props) {
  const router = useRouter();
  const copy = message.trim();
  const bg = backgroundColor.trim() || DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW_BG;

  if (!enabled || !copy) return null;

  return (
    <TouchableOpacity
      style={styles.touch}
      activeOpacity={0.9}
      onPress={() => router.push("/profile/subscription")}
      accessibilityRole="button"
      accessibilityLabel={copy}
    >
      <LinearGradient
        colors={gradientColors(bg)}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.card, { borderColor: `${bg}88` }]}
      >
        <View style={[styles.iconRing, { backgroundColor: `${bg}CC` }]}>
          <Ionicons name="ribbon" size={16} color="#B45309" />
        </View>

        <Text style={styles.message} numberOfLines={3}>
          {copy}
          <Text style={styles.knowMore}> Know more ›</Text>
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: "#3D3429",
  },
  knowMore: {
    fontWeight: "600",
    color: "#5C4F42",
  },
});
