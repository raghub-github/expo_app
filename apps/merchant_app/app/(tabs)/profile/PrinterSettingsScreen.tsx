import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { getStoreSettings, updateStoreSettings } from "@/services/storeSettingsApi";

type WidthOption = 58 | 80;

export default function PrinterSettingsScreen() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [widthMm, setWidthMm] = useState<WidthOption>(80);

  const load = useCallback(async () => {
    if (!token || !selectedStore?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getStoreSettings(selectedStore.id, token);
      setWidthMm(s.thermal_printer_width_mm === 58 ? 58 : 80);
    } catch {
      setWidthMm(80);
    } finally {
      setLoading(false);
    }
  }, [token, selectedStore?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: WidthOption) => {
    if (!token || !selectedStore?.id || saving) return;
    setWidthMm(next);
    setSaving(true);
    try {
      await updateStoreSettings(
        selectedStore.id,
        { thermal_printer_width_mm: next },
        token
      );
    } catch {
      void load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Thermal printer</Text>
      <Text style={styles.sub}>
        Kitchen order tickets (KOT) adapt to your receipt printer width. 80mm is the default for most thermal printers.
      </Text>
      {loading ? (
        <ActivityIndicator color={GatiMitraMerchant.primary} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.card}>
          <OptionRow
            label="58mm"
            hint="Compact roll — narrower layout"
            selected={widthMm === 58}
            disabled={saving}
            onPress={() => void save(58)}
          />
          <View style={styles.divider} />
          <OptionRow
            label="80mm (default)"
            hint="Standard thermal printer"
            selected={widthMm === 80}
            disabled={saving}
            onPress={() => void save(80)}
          />
          {saving ? <Text style={styles.hint}>Saving…</Text> : null}
        </View>
      )}
    </ScrollView>
  );
}

function OptionRow({
  label,
  hint,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && !disabled && { opacity: 0.85 }]}
    >
      <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  content: { padding: H_PADDING, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  sub: { marginTop: 8, fontSize: 14, lineHeight: 20, color: GatiMitraMerchant.textSecondary },
  card: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GatiMitraMerchant.primary,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  rowHint: { marginTop: 2, fontSize: 13, color: GatiMitraMerchant.textSecondary },
  divider: { height: 1, backgroundColor: GatiMitraMerchant.border, marginHorizontal: 16 },
  hint: { padding: 12, fontSize: 12, color: GatiMitraMerchant.textTertiary, textAlign: "center" },
});
