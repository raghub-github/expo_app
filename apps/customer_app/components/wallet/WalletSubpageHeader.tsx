import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";

const TEXT = "#111827";

type Props = {
  title: string;
  onBack: () => void;
  backgroundColor?: string;
  dark?: boolean;
};

/** Left-aligned back + title (Zomato wallet settings reference). */
export function WalletSubpageHeader({
  title,
  onBack,
  backgroundColor,
  dark = false,
}: Props) {
  const bg = backgroundColor ?? (dark ? "#121212" : "#F5F5F7");
  const fg = dark ? "#FFFFFF" : TEXT;
  return (
    <View style={[styles.header, { backgroundColor: bg }]}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={22} color={fg} />
      </TouchableOpacity>
      <AppText style={[styles.title, { color: fg }]} numberOfLines={1}>
        {title}
      </AppText>
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
    gap: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.3,
  },
});
