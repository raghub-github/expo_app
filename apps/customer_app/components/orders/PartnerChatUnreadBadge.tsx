import { View, StyleSheet, type ViewStyle } from "react-native";
import { AppText } from "@/components/AppText";


type PartnerChatUnreadBadgeProps = {
  count: number;
  style?: ViewStyle;
};

export function PartnerChatUnreadBadge({ count, style }: PartnerChatUnreadBadgeProps) {
  if (count < 1) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    <View style={[styles.badge, style]} accessibilityLabel={`${count} unread messages`}>
      <AppText style={styles.text}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 12,
  },
});
