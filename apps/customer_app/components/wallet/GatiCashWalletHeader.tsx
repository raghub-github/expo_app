import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";

const TEXT = "#111827";

export type GatiCashWalletHeaderProps = {
  onBack: () => void;
  onSettings: () => void;
  dark?: boolean;
};

/** Centered title header — Zomato Money / GatiCash wallet reference. */
export function GatiCashWalletHeader({
  onBack,
  onSettings,
  dark = false,
}: GatiCashWalletHeaderProps) {
  const icon = dark ? "#FFFFFF" : TEXT;
  return (
    <View style={[styles.header, dark && styles.headerDark]}>
      <TouchableOpacity onPress={onBack} style={styles.side} hitSlop={12} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={22} color={icon} />
      </TouchableOpacity>
      <AppText style={[styles.title, dark && styles.titleDark]} numberOfLines={1}>
        GatiCash
      </AppText>
      <TouchableOpacity onPress={onSettings} style={styles.side} hitSlop={12} activeOpacity={0.7}>
        <Ionicons name="settings-outline" size={21} color={icon} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  side: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
    letterSpacing: -0.2,
  },
  headerDark: {
    backgroundColor: "#121212",
    borderBottomColor: "#2F2F2F",
  },
  titleDark: {
    color: "#FFFFFF",
  },
});
