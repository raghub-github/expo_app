/**
 * Create new combo — name, description, price. Then redirect to edit to add components.
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
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!token || !storeId || !name.trim() || !price.trim()) return;
    const p = parseFloat(price);
    if (Number.isNaN(p) || p < 0) {
      Alert.alert("Invalid price", "Enter a valid price.");
      return;
    }
    setSaving(true);
    try {
      const created = await createCombo(storeId, token, {
        combo_name: name.trim(),
        description: description.trim() || null,
        combo_price: p,
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
        <TextInput
          style={styles.input}
          placeholder="Price (₹) *"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!name.trim() || !price.trim() || saving}
          style={[styles.saveBtn, (!name.trim() || !price.trim() || saving) && styles.saveBtnDisabled]}
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
