import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { getStoreSettings, updateStoreSettings } from "@/services/storeSettingsApi";

export default function AutoAcceptScreen() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!token || !selectedStore?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getStoreSettings(selectedStore.id, token);
      setEnabled(s.auto_accept_orders);
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [token, selectedStore?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (next: boolean) => {
    if (!token || !selectedStore?.id) return;
    setEnabled(next);
    setSaving(true);
    try {
      await updateStoreSettings(selectedStore.id, { auto_accept_orders: next }, token);
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Auto accept orders</Text>
      <Text style={styles.sub}>
        When enabled, new orders are accepted automatically after your configured delay (same as Partner Site).
        When disabled, you must accept each order manually.
      </Text>
      {loading ? (
        <ActivityIndicator color={GatiMitraMerchant.primary} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Auto accept new orders</Text>
            <Switch
              value={enabled}
              onValueChange={(v) => void onToggle(v)}
              disabled={saving}
              trackColor={{ false: "#E5E7EB", true: GatiMitraMerchant.primary }}
            />
          </View>
          {saving ? (
            <Text style={styles.hint}>Saving…</Text>
          ) : (
            <Text style={styles.hint}>
              {enabled
                ? "New CREATED orders will auto-accept on this device."
                : "Auto accept is off — tap Accept on each new order."}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  content: { padding: H_PADDING, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  sub: { marginTop: 8, fontSize: 14, lineHeight: 20, color: GatiMitraMerchant.textSecondary },
  card: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontSize: 16, fontWeight: "600", color: GatiMitraMerchant.textPrimary, flex: 1, paddingRight: 12 },
  hint: { marginTop: 10, fontSize: 13, color: GatiMitraMerchant.textSecondary },
});
