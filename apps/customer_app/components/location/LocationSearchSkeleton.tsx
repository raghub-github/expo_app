import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";


export function LocationSearchSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={styles.wrap}>
      <AppText style={styles.loadingLabel}>Searching locations...</AppText>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.iconSk} />
          <View style={styles.textCol}>
            <View style={[styles.line, styles.linePrimary]} />
            <View style={[styles.line, styles.lineSecondary]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 8 },
  loadingLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  iconSk: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E5E7EB",
  },
  textCol: { flex: 1, gap: 8 },
  line: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E5E7EB",
  },
  linePrimary: { width: "72%" },
  lineSecondary: { width: "92%" },
});
