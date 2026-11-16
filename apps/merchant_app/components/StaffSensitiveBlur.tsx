import { type ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

/**
 * Soft-blur sensitive blocks for store STAFF (section stays visible but unreadable / non-interactive).
 */
export function StaffSensitiveBlur({
  locked,
  title = "Owner access only",
  message = "Legal documents and bank details are hidden for staff.",
  children,
  minHeight = 120,
}: {
  locked: boolean;
  title?: string;
  message?: string;
  children: ReactNode;
  minHeight?: number;
}) {
  if (!locked) return <>{children}</>;

  return (
    <View style={[styles.wrap, { minHeight }]}>
      <View style={styles.blurred} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
      <View style={styles.overlay} pointerEvents="auto">
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={16} color={GatiMitraMerchant.textSecondary} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: CARD_RADIUS,
  },
  blurred: {
    opacity: 0.28,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.55)",
    paddingHorizontal: 16,
  },
  badge: {
    maxWidth: 260,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  message: {
    fontSize: 11,
    lineHeight: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
});
