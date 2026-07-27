import { useCallback, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useMenuItem } from "@/hooks/useMenuQueries";
import { addVariant, updateVariant, deleteVariant } from "@/services/menuApi";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

export default function ItemVariantsScreen() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const numericItemId = itemId ? Number(itemId) : NaN;
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const { data: item, isLoading, refetch } = useMenuItem(storeId, Number.isFinite(numericItemId) ? numericItemId : null, token);

  const variants = item?.variants ?? [];

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const canUse = Boolean(token && storeId && Number.isFinite(numericItemId));
  const title = useMemo(() => (item?.item_name ? `${item.item_name}` : "Variants"), [item?.item_name]);

  const onAdd = useCallback(async () => {
    if (!canUse || !token || !storeId || !Number.isFinite(numericItemId)) return;
    const n = name.trim();
    const p = Number(price);
    if (!n) return Alert.alert("Invalid", "Enter variant name.");
    if (!Number.isFinite(p) || p < 0) return Alert.alert("Invalid", "Enter valid price.");
    setSaving(true);
    try {
      await addVariant(storeId, numericItemId, token, { variant_name: n, variant_price: p, display_order: variants.length });
      setName("");
      setPrice("");
      await refetch();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not add variant.");
    } finally {
      setSaving(false);
    }
  }, [canUse, token, storeId, numericItemId, name, price, variants.length, refetch]);

  const onEdit = useCallback(async (variantId: number, currentName: string, currentPrice: string) => {
    if (!canUse || !token || !storeId) return;
    Alert.prompt?.(
      "Edit variant name",
      "Update the variant name",
      async (text) => {
        const next = (text ?? "").trim();
        if (!next) return;
        setSaving(true);
        try {
          await updateVariant(storeId, variantId, token, { variant_name: next });
          await refetch();
        } catch (e) {
          Alert.alert("Failed", e instanceof Error ? e.message : "Could not update variant.");
        } finally {
          setSaving(false);
        }
      },
      "plain-text",
      currentName
    );
    if (!Alert.prompt) {
      Alert.alert("Edit", "Name editing is not supported on this device. Please use the dashboard for now.");
    }
  }, [canUse, token, storeId, refetch]);

  const onDelete = useCallback(async (variantId: number, variantName: string) => {
    if (!canUse || !token || !storeId) return;
    Alert.alert("Delete variant?", `Remove "${variantName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteVariant(storeId, variantId, token);
            await refetch();
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Could not delete variant.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [canUse, token, storeId, refetch]);

  return (
    <View style={{ flex: 1, backgroundColor: GatiMitraMerchant.background }}>
      <View style={{ paddingHorizontal: H_PADDING, paddingTop: 14, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={{ paddingVertical: 6, paddingHorizontal: 6 }}>
          <Ionicons name="chevron-back" size={22} color={GatiMitraMerchant.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: GatiMitraMerchant.textSecondary }} numberOfLines={1}>
            Add or remove variants (size, half/full, etc.)
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: H_PADDING, gap: 12 }}>
        {!canUse ? (
          <Text style={{ color: GatiMitraMerchant.textSecondary }}>Select a store and sign in.</Text>
        ) : isLoading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color={GatiMitraMerchant.primary} />
          </View>
        ) : (
          <>
            <View style={{ backgroundColor: GatiMitraMerchant.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border, gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary }}>Add variant</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Variant name (e.g. Half, Full)"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                style={{ borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: GatiMitraMerchant.textPrimary }}
              />
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="Variant price (₹)"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                keyboardType="numeric"
                style={{ borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: GatiMitraMerchant.textPrimary }}
              />
              <TouchableOpacity
                onPress={onAdd}
                disabled={saving}
                style={{ backgroundColor: GatiMitraMerchant.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Add</Text>}
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: GatiMitraMerchant.textPrimary }}>
                Existing variants ({variants.length})
              </Text>
              {variants.length === 0 ? (
                <Text style={{ color: GatiMitraMerchant.textSecondary }}>No variants added yet.</Text>
              ) : (
                variants.map((v) => (
                  <View key={v.id} style={{ backgroundColor: GatiMitraMerchant.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: GatiMitraMerchant.textPrimary }} numberOfLines={1}>
                      {v.variant_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 }}>
                      ₹{Number(v.variant_price).toFixed(0)}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => onEdit(v.id, v.variant_name, v.variant_price)}
                        disabled={saving}
                        style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: GatiMitraMerchant.surfaceSubtle, borderWidth: 1, borderColor: GatiMitraMerchant.border }}
                      >
                        <Text style={{ fontWeight: "800", color: GatiMitraMerchant.textPrimary }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onDelete(v.id, v.variant_name)}
                        disabled={saving}
                        style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fecaca" }}
                      >
                        <Text style={{ fontWeight: "800", color: "#991b1b" }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

