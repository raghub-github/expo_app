import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useMenuItem } from "@/hooks/useMenuQueries";
import {
  addCustomizationGroup,
  updateCustomizationGroup,
  deleteCustomizationGroup,
  addCustomizationOption,
  updateCustomizationOption,
  deleteCustomizationOption,
} from "@/services/menuApi";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

export default function ItemCustomizationsScreen() {
  const router = useRouter();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const numericItemId = itemId ? Number(itemId) : NaN;
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const { data: item, isLoading, refetch } = useMenuItem(storeId, Number.isFinite(numericItemId) ? numericItemId : null, token);
  const groups = item?.customizations ?? [];

  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [addonName, setAddonName] = useState("");
  const [addonPrice, setAddonPrice] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const canUse = Boolean(token && storeId && Number.isFinite(numericItemId));
  const title = useMemo(() => (item?.item_name ? `${item.item_name}` : "Customizations"), [item?.item_name]);

  const onAddGroup = useCallback(async () => {
    if (!canUse || !token || !storeId || !Number.isFinite(numericItemId)) return;
    const n = groupName.trim();
    if (!n) return Alert.alert("Invalid", "Enter customization group name.");
    setSaving(true);
    try {
      await addCustomizationGroup(storeId, numericItemId, token, { customization_title: n, display_order: groups.length });
      setGroupName("");
      await refetch();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not add group.");
    } finally {
      setSaving(false);
    }
  }, [canUse, token, storeId, numericItemId, groupName, groups.length, refetch]);

  const onDeleteGroup = useCallback(async (groupId: number, name: string) => {
    if (!canUse || !token || !storeId) return;
    Alert.alert("Delete group?", `Remove "${name}" and its add-ons?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteCustomizationGroup(storeId, groupId, token);
            if (selectedGroupId === groupId) setSelectedGroupId(null);
            await refetch();
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Could not delete group.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [canUse, token, storeId, refetch, selectedGroupId]);

  const onAddAddon = useCallback(async () => {
    if (!canUse || !token || !storeId || selectedGroupId == null) return;
    const n = addonName.trim();
    const p = Number(addonPrice);
    if (!n) return Alert.alert("Invalid", "Enter add-on name.");
    if (!Number.isFinite(p) || p < 0) return Alert.alert("Invalid", "Enter valid price.");
    const group = groups.find((g) => g.id === selectedGroupId);
    const display_order = group ? (group.options?.length ?? 0) : 0;
    setSaving(true);
    try {
      await addCustomizationOption(storeId, selectedGroupId, token, { addon_name: n, addon_price: p, display_order });
      setAddonName("");
      setAddonPrice("");
      await refetch();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not add add-on.");
    } finally {
      setSaving(false);
    }
  }, [canUse, token, storeId, selectedGroupId, addonName, addonPrice, groups, refetch]);

  const onDeleteAddon = useCallback(async (optionId: number, name: string) => {
    if (!canUse || !token || !storeId) return;
    Alert.alert("Delete add-on?", `Remove "${name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteCustomizationOption(storeId, optionId, token);
            await refetch();
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Could not delete add-on.");
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
            Customizations & add-ons (extra cheese, spice level, etc.)
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
              <Text style={{ fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary }}>Add customization group</Text>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Group name (e.g. Toppings)"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                style={{ borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: GatiMitraMerchant.textPrimary }}
              />
              <TouchableOpacity
                onPress={onAddGroup}
                disabled={saving}
                style={{ backgroundColor: GatiMitraMerchant.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Add group</Text>}
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: GatiMitraMerchant.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border, gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary }}>Add add-on (option)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {groups.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => setSelectedGroupId(g.id)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: selectedGroupId === g.id ? GatiMitraMerchant.primary : GatiMitraMerchant.border,
                      backgroundColor: selectedGroupId === g.id ? GatiMitraMerchant.surfaceWarm : GatiMitraMerchant.surfaceSubtle,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.textPrimary }}>{g.customization_title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {groups.length === 0 ? (
                <Text style={{ color: GatiMitraMerchant.textSecondary }}>Create a group first.</Text>
              ) : (
                <>
                  <TextInput
                    value={addonName}
                    onChangeText={setAddonName}
                    placeholder="Add-on name (e.g. Extra cheese)"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                    style={{ borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: GatiMitraMerchant.textPrimary }}
                  />
                  <TextInput
                    value={addonPrice}
                    onChangeText={setAddonPrice}
                    placeholder="Add-on price (₹)"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                    keyboardType="numeric"
                    style={{ borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: GatiMitraMerchant.textPrimary }}
                  />
                  <TouchableOpacity
                    onPress={onAddAddon}
                    disabled={saving || selectedGroupId == null}
                    style={{ backgroundColor: GatiMitraMerchant.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", opacity: saving || selectedGroupId == null ? 0.7 : 1 }}
                  >
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Add add-on</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: GatiMitraMerchant.textPrimary }}>
                Existing groups ({groups.length})
              </Text>
              {groups.length === 0 ? (
                <Text style={{ color: GatiMitraMerchant.textSecondary }}>No customizations added yet.</Text>
              ) : (
                groups.map((g) => (
                  <View key={g.id} style={{ backgroundColor: GatiMitraMerchant.cardBg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border, gap: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: GatiMitraMerchant.textPrimary }} numberOfLines={1}>
                          {g.customization_title}
                        </Text>
                        <Text style={{ fontSize: 12, color: GatiMitraMerchant.textSecondary }}>
                          {g.is_required ? "Required" : "Optional"} · Min {g.min_selection} / Max {g.max_selection}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => onDeleteGroup(g.id, g.customization_title)}
                        disabled={saving}
                        style={{ borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fecaca" }}
                      >
                        <Text style={{ fontWeight: "800", color: "#991b1b" }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                    {(g.options?.length ?? 0) === 0 ? (
                      <Text style={{ color: GatiMitraMerchant.textSecondary }}>No add-ons in this group.</Text>
                    ) : (
                      (g.options ?? []).map((o) => (
                        <View key={o.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: GatiMitraMerchant.border }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary }} numberOfLines={1}>
                              {o.addon_name}
                            </Text>
                            <Text style={{ fontSize: 12, color: GatiMitraMerchant.textSecondary }}>
                              ₹{Number(o.addon_price).toFixed(0)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => onDeleteAddon(o.id, o.addon_name)}
                            disabled={saving}
                            style={{ borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fecaca" }}
                          >
                            <Text style={{ fontWeight: "800", color: "#991b1b" }}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
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

