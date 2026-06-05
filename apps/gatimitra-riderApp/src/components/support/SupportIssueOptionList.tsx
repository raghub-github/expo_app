import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RaiseTicketCategoryCard } from "@/src/components/support/RaiseTicketCategoryCard";

export type SupportIssueOption = {
  key: string;
  label: string;
  subtitle?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  gradient?: readonly [string, string];
};

type Props = {
  prompt?: string;
  items: SupportIssueOption[];
  onSelect: (key: string) => void;
  loading?: boolean;
};

export function SupportIssueOptionList({ prompt, items, onSelect, loading }: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {prompt ? <Text style={styles.prompt}>{prompt}</Text> : null}
      {items.map((item) => (
        <RaiseTicketCategoryCard
          key={item.key}
          compact
          title={item.label}
          description={item.subtitle}
          icon={item.icon ?? "help-circle-outline"}
          gradient={item.gradient ?? (["#475569", "#64748B"] as const)}
          onPress={() => onSelect(item.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  prompt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  center: { paddingVertical: 40, alignItems: "center" },
});
