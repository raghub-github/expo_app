import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  onPress: () => void;
};

export function PastOrdersBanner({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.textCol}>
        <Text style={styles.title}>Want to see orders older than 24 hours?</Text>
        <Text style={styles.sub}>View delivered, cancelled, and past orders</Text>
      </View>
      <View style={styles.btn}>
        <Text style={styles.btnText}>Past orders</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  pressed: { opacity: 0.92 },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E3A8A",
    lineHeight: 19,
  },
  sub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#3B82F6",
    marginTop: 3,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.primary,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  btnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
