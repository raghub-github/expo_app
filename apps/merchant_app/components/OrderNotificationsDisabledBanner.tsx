import { AppText as Text } from "@/components/AppText";
import { Pressable, StyleSheet } from "react-native";
import { useNotificationPermissionGate } from "@/context/NotificationPermissionGateContext";

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
    flex: 1,
    height: "100%",
    marginHorizontal: 0,
    paddingVertical: 0,
    paddingHorizontal: 14,
    paddingRight: 12,
    marginBottom: 0,
    backgroundColor: "#92600A",
    borderRadius: 0,
    justifyContent: "center",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 16,
  },
  link: {
    fontWeight: "800",
    textDecorationLine: "underline",
  },
});
