/**
 * Shared sub-page header for profile stack screens (wallet, settings, verify email).
 */

import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ProfileTheme } from "@/constants/profileTheme";

type ProfileSubpageHeaderProps = {
  title: string;
  onBack: () => void;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
};

export function ProfileSubpageHeader({ title, onBack, rightAction }: ProfileSubpageHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top - 4, 6) }]}>
      <TouchableOpacity onPress={onBack} style={styles.side} hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={ProfileTheme.text} />
      </TouchableOpacity>
      <AppText style={styles.title} numberOfLines={1}>
        {title}
      </AppText>
      {rightAction ? (
        <TouchableOpacity onPress={rightAction.onPress} style={styles.side} hitSlop={12}>
          <Ionicons name={rightAction.icon} size={21} color={ProfileTheme.text} />
        </TouchableOpacity>
      ) : (
        <View style={styles.side} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ProfileTheme.border,
  },
  side: { width: 40, alignItems: "center" },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: ProfileTheme.text,
  },
});
