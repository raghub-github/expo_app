/**
 * Combos list — create and open combo for edit.
 */

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { fetchCombos, type ComboRow } from "@/services/menuApi";

export default function CombosListScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const res = await fetchCombos(storeId, token);
      setCombos(res.combos ?? []);
    } catch {
      setCombos([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    if (token && storeId) load();
    else setLoading(false);
  }, [token, storeId, load]);

  if (!storeId || !token) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Select a store and sign in.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Combo meals</Text>
        <TouchableOpacity
          onPress={() => router.push("/menu/combos/new" as any)}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={24} color={GatiMitraMerchant.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={GatiMitraMerchant.primary} />
        }
      >
        {loading && combos.length === 0 ? (
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} style={styles.loader} />
        ) : combos.length === 0 ? (
          <Text style={styles.emptyText}>No combos yet. Tap + to create one.</Text>
        ) : (
          combos.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.card}
              onPress={() => router.push({ pathname: "/menu/combos/[id]", params: { id: String(c.id) } } as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{c.combo_name}</Text>
                {c.description ? (
                  <Text style={styles.cardDesc} numberOfLines={2}>{c.description}</Text>
                ) : null}
                <Text style={styles.cardPrice}>₹{Number(c.combo_price).toFixed(0)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={GatiMitraMerchant.textTertiary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  centered: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  backBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  addBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING },
  loader: { marginTop: 24 },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textAlign: "center", paddingVertical: 24 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  cardDesc: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  cardPrice: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.primary, marginTop: 6 },
});
