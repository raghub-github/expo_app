import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { RaiseTicketCategoryCard } from "@/src/components/support/RaiseTicketCategoryCard";
import type { RiderRecentOrder } from "@/src/services/riderSupport.service";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];

type Props = {
  prompt: string;
  orders: RiderRecentOrder[];
  loading?: boolean;
  onSelect: (order: RiderRecentOrder) => void;
};

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SupportOrderPickerList({ prompt, orders, loading, onSelect }: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{prompt}</Text>
      {orders.map((o) => (
        <RaiseTicketCategoryCard
          key={o.id}
          compact
          title={o.formatted_order_id || o.order_id || `#${o.id}`}
          description={[
            o.merchant_store_name,
            formatStatus(o.current_status || o.status),
            o.grand_total != null ? `₹${o.grand_total}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          icon="cube-outline"
          gradient={["#0D9488", "#14B8A6"]}
          onPress={() => onSelect(o)}
        />
      ))}
      {orders.length === 0 ? (
        <Text style={styles.emptyInline}>No orders found.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  center: { paddingVertical: 48, alignItems: "center" },
  prompt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  emptyInline: { padding: 16, fontSize: 13, color: "#64748B", textAlign: "center" },
});
