/**
 * Create new combo — name and description only. Price is the sum of selected items; add items on the next screen.
 */

import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { createCombo } from "@/services/menuApi";

export default function NewComboScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!token || !storeId || !name.trim()) return;
    setSaving(true);
    try {
      const created = await createCombo(storeId, token, {
        combo_name: name.trim(),
        description: description.trim() || null,
        combo_price: 0,
      });
      router.replace({ pathname: "/menu/combos/[id]", params: { id: String(created.id) } } as any);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not create combo.");
    } finally {
      setSaving(false);
    }
  };

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
        <Text style={styles.title}>New combo</Text>
      </View>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Combo name *"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description (optional)"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Text style={styles.hint}>
          Price will be the sum of all items you add. You can add offers later to reduce it.
        </Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!name.trim() || saving}
          style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Create & add items</Text>}
        </TouchableOpacity>
      </View>
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
  form: { padding: H_PADDING },
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
  textArea: { minHeight: 80, textAlignVertical: "top" },
  hint: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
});
