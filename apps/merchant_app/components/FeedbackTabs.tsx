import { Pressable, StyleSheet, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant } from "@/constants/theme";

type FeedbackTab = "complaints" | "reviews";

/**
 * Complaints / Reviews switch — same navy blue as Growth / Earnings chips.
 */
export function FeedbackTabs({ active }: { active: FeedbackTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const inProfile = pathname.includes("/profile/");
  const complaintsHref = inProfile ? "/(tabs)/profile/complaints" : "/(tabs)/complaints";
  const reviewsHref = inProfile ? "/(tabs)/profile/reviews" : "/(tabs)/reviews";

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            if (active !== "complaints") router.replace(complaintsHref as never);
          }}
          style={({ pressed }) => [
            styles.cell,
            active === "complaints" && styles.cellActive,
            pressed && styles.pressed,
            GatiMitraMerchant.cursorPointer,
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === "complaints" }}
          accessibilityLabel="Complaints"
        >
          <Ionicons
            name={active === "complaints" ? "alert-circle" : "alert-circle-outline"}
            size={15}
            color={active === "complaints" ? "#FFFFFF" : GatiMitraMerchant.navy}
          />
          <Text style={[styles.label, active === "complaints" && styles.labelActive]}>
            Complaints
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (active !== "reviews") router.replace(reviewsHref as never);
          }}
          style={({ pressed }) => [
            styles.cell,
            active === "reviews" && styles.cellActive,
            pressed && styles.pressed,
            GatiMitraMerchant.cursorPointer,
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === "reviews" }}
          accessibilityLabel="Reviews"
        >
          <Ionicons
            name={active === "reviews" ? "star" : "star-outline"}
            size={15}
            color={active === "reviews" ? "#FFFFFF" : GatiMitraMerchant.navy}
          />
          <Text style={[styles.label, active === "reviews" && styles.labelActive]}>
            Reviews
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 4,
    gap: 4,
  },
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
  },
  cellActive: {
    backgroundColor: GatiMitraMerchant.navy,
  },
  pressed: { opacity: 0.88 },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
  },
  labelActive: {
    color: "#FFFFFF",
  },
});
