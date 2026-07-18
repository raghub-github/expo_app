import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";

export type RideMapToastProps = {
  visible: boolean;
  title: string;
  message?: string;
  topInset?: number;
};

export function RideMapToast({ visible, title, message, topInset = 0 }: RideMapToastProps) {
  if (!visible) return null;

  return (
    <View style={[styles.wrap, { top: topInset + 58 }]} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="information-circle" size={20} color="#047857" />
        </View>
        <View style={styles.textCol}>
          <AppText style={styles.title}>{title}</AppText>
          {message ? <AppText style={styles.message}>{message}</AppText> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 5,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D1FAE5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  iconWrap: {
    marginTop: 1,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  message: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4B5563",
    lineHeight: 17,
  },
});
