/**
 * Edit addon group — title, description, selection rules; list/add/edit/delete options.
 */

import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchModifierGroups,
  fetchModifierOptions,
  updateModifierGroup,
  addModifierOption,
  updateModifierOption,
  deleteModifierOption,
  type ModifierGroupRow,
  type ModifierOptionRow,
} from "@/services/menuApi";

export default function AddonGroupEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const groupId = id != null ? parseInt(id, 10) : NaN;
  const [group, setGroup] = useState<ModifierGroupRow | null>(null);
  const [options, setOptions] = useState<ModifierOptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [minSelection, setMinSelection] = useState("0");
  const [maxSelection, setMaxSelection] = useState("1");

  const [addOptionVisible, setAddOptionVisible] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionPrice, setNewOptionPrice] = useState("");
  const [addingOption, setAddingOption] = useState(false);

  const load = useCallback(async () => {
    if (!storeId || !token || Number.isNaN(groupId)) return;
    try {
      const res = await fetchModifierGroups(storeId, token);
      const g = res.modifierGroups?.find((x) => x.id === groupId);
      setGroup(g ?? null);
      if (g) {
        setTitle(g.title);
        setDescription(g.description ?? "");
        setIsRequired(g.is_required);
        setMinSelection(String(g.min_selection));
        setMaxSelection(String(g.max_selection));
        const optRes = await fetchModifierOptions(storeId, groupId, token);
        setOptions(optRes.options ?? []);
      }
    } catch {
      setGroup(null);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, token, groupId]);

  useEffect(() => {
    if (storeId && token && !Number.isNaN(groupId)) load();
    else setLoading(false);
  }, [storeId, token, groupId, load]);

  const handleSaveGroup = async () => {
    if (!storeId || !token || Number.isNaN(groupId)) return;
    const min = parseInt(minSelection, 10) || 0;
    const max = parseInt(maxSelection, 10) || 1;
    setSaving(true);
    try {
      await updateModifierGroup(storeId, groupId, token, {
        title: title.trim(),
        description: description.trim() || null,
        is_required: isRequired,
        min_selection: min,
        max_selection: max,
      });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddOption = async () => {
    const name = newOptionName.trim();
    if (!name || !storeId || !token || Number.isNaN(groupId)) return;
    const price = parseFloat(newOptionPrice) || 0;
    setAddingOption(true);
    try {
      await addModifierOption(storeId, groupId, token, { name, price_delta: price });
      setAddOptionVisible(false);
      setNewOptionName("");
      setNewOptionPrice("");
      const optRes = await fetchModifierOptions(storeId, groupId, token);
      setOptions(optRes.options ?? []);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add option.");
    } finally {
      setAddingOption(false);
    }
  };

  const handleDeleteOption = (opt: ModifierOptionRow) => {
    if (!storeId || !token) return;
    Alert.alert(
      "Remove option?",
      `Remove "${opt.name}" from this addon group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteModifierOption(storeId, opt.id, token);
              await load();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not remove.");
            }
          },
        },
      ]
    );
  };

  const scrollBottom = TAB_BAR_SCROLL_CONTENT_PADDING + 16;

  if (!storeId || !token) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Select a store and sign in.</Text>
      </View>
    );
  }

  if (loading && !group) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Addon group not found.</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Back to Addon Library</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{group.title}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottom }]}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Group details</Text>
          <TextInput
            style={styles.input}
            placeholder="Title"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={[styles.input, styles.inputArea]}
            placeholder="Description (optional)"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <View style={styles.row}>
            <Text style={styles.label}>Required</Text>
            <Switch
              value={isRequired}
              onValueChange={setIsRequired}
              trackColor={{ false: GatiMitraMerchant.border, true: GatiMitraMerchant.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.rowTwo}>
            <View style={styles.half}>
              <Text style={styles.label}>Min selection</Text>
              <TextInput
                style={styles.input}
                value={minSelection}
                onChangeText={setMinSelection}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Max selection</Text>
              <TextInput
                style={styles.input}
                value={maxSelection}
                onChangeText={setMaxSelection}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGroup} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save group</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Options ({options.length})</Text>
            <TouchableOpacity style={styles.addOptionBtn} onPress={() => setAddOptionVisible(true)}>
              <Ionicons name="add" size={20} color={GatiMitraMerchant.primary} />
              <Text style={styles.addOptionBtnText}>Add option</Text>
            </TouchableOpacity>
          </View>

          {options.length === 0 && !addOptionVisible ? (
            <Text style={styles.hint}>No options yet. Add options (e.g. Extra cheese ₹20).</Text>
          ) : (
            <View style={styles.optionsList}>
              {options.map((opt) => (
                <View key={opt.id} style={styles.optionRow}>
                  <View style={styles.optionMain}>
                    <Text style={styles.optionName}>{opt.name}</Text>
                    <Text style={styles.optionPrice}>+₹{Number(opt.price_delta).toFixed(0)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteOption(opt)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={GatiMitraMerchant.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {addOptionVisible && (
            <View style={styles.addOptionCard}>
              <TextInput
                style={styles.input}
                placeholder="Option name"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={newOptionName}
                onChangeText={setNewOptionName}
              />
              <TextInput
                style={styles.input}
                placeholder="Price (₹)"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={newOptionPrice}
                onChangeText={setNewOptionPrice}
                keyboardType="decimal-pad"
              />
              <View style={styles.addOptionActions}>
                <TouchableOpacity onPress={() => { setAddOptionVisible(false); setNewOptionName(""); setNewOptionPrice(""); }}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addOptionConfirm, !newOptionName.trim() && styles.addOptionConfirmDisabled]}
                  onPress={handleAddOption}
                  disabled={!newOptionName.trim() || addingOption}
                >
                  {addingOption ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addOptionConfirmText}>Add</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.usedInCard}>
          <Ionicons name="restaurant-outline" size={20} color={GatiMitraMerchant.textSecondary} />
          <Text style={styles.usedInText}>Used in {group.used_in_items_count} item{group.used_in_items_count !== 1 ? "s" : ""}</Text>
        </View>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  backBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  headerRight: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PADDING, paddingTop: 16 },
  section: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 12 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  inputArea: { minHeight: 60, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  rowTwo: { flexDirection: "row", gap: 12, marginBottom: 12 },
  half: { flex: 1 },
  label: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary, marginBottom: 6 },
  saveBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  addOptionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  addOptionBtnText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.primary },
  hint: { fontSize: 13, color: GatiMitraMerchant.textTertiary, marginBottom: 12 },
  optionsList: { gap: 0 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  optionMain: { flex: 1 },
  optionName: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  optionPrice: { fontSize: 13, color: GatiMitraMerchant.primary, marginTop: 2 },
  addOptionCard: {
    marginTop: 12,
    padding: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
  },
  addOptionActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 8 },
  cancelText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  addOptionConfirm: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: GatiMitraMerchant.primary, borderRadius: 8 },
  addOptionConfirmDisabled: { opacity: 0.5 },
  addOptionConfirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  usedInCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
  },
  usedInText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  backLink: { marginTop: 16 },
  backLinkText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.primary },
});
