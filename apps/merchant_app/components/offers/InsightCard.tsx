import { View, Text, StyleSheet, Pressable } from "react-native";
import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onMenuPress?: () => void;
};

export function InsightCard({ title, subtitle = "Last updated: just now", children, onMenuPress }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Pressable onPress={onMenuPress} hitSlop={12} style={styles.menuBtn}>
          <Ionicons name="ellipsis-vertical" size={18} color={GatiMitraMerchant.textTertiary} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 16,
    ...GatiMitraMerchant.shadowSm,
  },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  subtitle: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 3 },
  menuBtn: { padding: 4 },
});
