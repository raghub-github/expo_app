import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

export type RideServiceTab = "all" | "intercity";

type Props = {
  activeTab: RideServiceTab;
  onTabChange: (tab: RideServiceTab) => void;
  bottomInset?: number;
};

export function RideServiceBottomNav({ activeTab, onTabChange, bottomInset = 0 }: Props) {
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 10) }]}>
      <TouchableOpacity
        style={[styles.tab, activeTab === "all" && styles.tabActive]}
        onPress={() => onTabChange("all")}
        activeOpacity={0.85}
      >
        <Ionicons
          name="grid-outline"
          size={18}
          color={activeTab === "all" ? GatiMitraColors.primaryMint : GatiMitraColors.textSecondary}
        />
        <Text style={[styles.tabLabel, activeTab === "all" && styles.tabLabelActive]}>
          All Services
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === "intercity" && styles.tabActive]}
        onPress={() => onTabChange("intercity")}
        activeOpacity={0.85}
      >
        <Ionicons
          name="map-outline"
          size={18}
          color={activeTab === "intercity" ? GatiMitraColors.primaryMint : GatiMitraColors.textSecondary}
        />
        <Text style={[styles.tabLabel, activeTab === "intercity" && styles.tabLabelActive]}>
          Inter city
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    backgroundColor: GatiMitraColors.cardBg,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
    paddingTop: 8,
    paddingHorizontal: 24,
    gap: 12,
    ...GatiMitraColors.searchShadow,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  tabActive: {
    backgroundColor: "#ECFDF5",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  tabLabelActive: {
    color: GatiMitraColors.deepMintStart,
    fontWeight: "800",
  },
});
