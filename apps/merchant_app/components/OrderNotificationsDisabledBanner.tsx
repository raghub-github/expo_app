import { AppText as Text } from "@/components/AppText";
import { Pressable, StyleSheet } from "react-native";
import { useNotificationPermissionGate } from "@/context/NotificationPermissionGateContext";
import { H_PADDING } from "@/constants/theme";

/**
 * Inline alert when OS order notifications are off — no dismiss (X) control.
 */
export function OrderNotificationsDisabledBanner({ visible }: { visible: boolean }) {
  const { openPermissionGate } = useNotificationPermissionGate();

  if (!visible) return null;

  return (
    <Pressable
      style={styles.banner}
      onPress={openPermissionGate}
      accessibilityRole="button"
      accessibilityLabel="Order notifications are disabled. Troubleshoot."
    >
      <Text style={styles.text}>
        Order notifications are disabled.{" "}
        <Text style={styles.link}>Troubleshoot</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: -H_PADDING,
    paddingVertical: 11,
    paddingHorizontal: H_PADDING,
    marginBottom: 12,
    backgroundColor: "#92600A",
    borderRadius: 0,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 18,
  },
  link: {
    fontWeight: "800",
    textDecorationLine: "underline",
  },
});
