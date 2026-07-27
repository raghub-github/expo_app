import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Modal, Pressable, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { GatiMitraMerchant } from "@/constants/theme";
import type { MenuCategory } from "@/services/menuApi";
import { useDeleteCategory, useUpdateCategory } from "@/hooks/useMenuQueries";

type CategoryMenuTarget = {
  categoryId: number;
  displayName: string;
};

type DeleteConfirm =
  | { kind: "category"; category: MenuCategory }
  | { kind: "subcategory"; category: MenuCategory };

type SubcategoryPickerMode = "edit" | "delete";

export function CatalogCategoryMenuSheet({
  visible,
  target,
  categories,
  storeId,
  token,
  onClose,
  onChanged,
}: {
  visible: boolean;
  target: CategoryMenuTarget | null;
  categories: MenuCategory[];
  storeId: string | null;
  token: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const updateCat = useUpdateCategory(storeId, token);
  const deleteCat = useDeleteCategory(storeId, token);

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [editTarget, setEditTarget] = useState<MenuCategory | null>(null);
  const [editName, setEditName] = useState("");
  const [subcategoryPickerMode, setSubcategoryPickerMode] = useState<SubcategoryPickerMode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const category = useMemo(
    () => (target ? categories.find((c) => c.id === target.categoryId) ?? null : null),
    [categories, target],
  );

  const parentCategory = useMemo(() => {
    if (!category) return null;
    if (category.parent_category_id == null) return category;
    return categories.find((c) => c.id === category.parent_category_id) ?? category;
  }, [category, categories]);

  const subcategories = useMemo(() => {
    if (!parentCategory) return [];
    return categories
      .filter((c) => c.parent_category_id === parentCategory.id)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }, [categories, parentCategory]);

  const headerTitle = parentCategory?.category_name ?? target?.displayName ?? "Category";

  useEffect(() => {
    if (!visible) {
      setDeleteConfirm(null);
      setEditTarget(null);
      setEditName("");
      setSubcategoryPickerMode(null);
      setDeleting(false);
    }
  }, [visible]);

  const closeAll = useCallback(() => {
    setDeleteConfirm(null);
    setEditTarget(null);
    setSubcategoryPickerMode(null);
    onClose();
  }, [onClose]);

  const openEditModal = useCallback((c: MenuCategory) => {
    setEditTarget(c);
    setEditName(c.category_name);
    setSubcategoryPickerMode(null);
  }, []);

  const handleEditCategoryName = useCallback(() => {
    if (!parentCategory) return;
    openEditModal(parentCategory);
  }, [openEditModal, parentCategory]);

  const handleEditSubcategoryName = useCallback(() => {
    if (!category) return;
    if (category.parent_category_id != null) {
      openEditModal(category);
      return;
    }
    if (subcategories.length === 0) {
      Alert.alert("No sub-categories", "This category has no sub-categories to edit.");
      return;
    }
    if (subcategories.length === 1) {
      openEditModal(subcategories[0]!);
      return;
    }
    setSubcategoryPickerMode("edit");
  }, [category, openEditModal, subcategories]);

  const handleDeleteCategory = useCallback(() => {
    if (!parentCategory) return;
    setDeleteConfirm({ kind: "category", category: parentCategory });
  }, [parentCategory]);

  const handleDeleteSubcategory = useCallback(() => {
    if (!category) return;
    if (category.parent_category_id != null) {
      setDeleteConfirm({ kind: "subcategory", category });
      return;
    }
    if (subcategories.length === 0) {
      Alert.alert("No sub-categories", "This category has no sub-categories to delete.");
      return;
    }
    if (subcategories.length === 1) {
      setDeleteConfirm({ kind: "subcategory", category: subcategories[0]! });
      return;
    }
    setSubcategoryPickerMode("delete");
  }, [category, subcategories]);

  const handleTimings = useCallback(() => {
    if (!category) return;
    const id = category.id;
    const name = category.category_name;
    closeAll();
    router.push({
      pathname: "/menu/category-availability",
      params: { categoryId: String(id), categoryName: name },
    } as never);
  }, [category, closeAll, router]);

  const handleSaveEdit = useCallback(async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      await updateCat.mutateAsync({
        categoryId: editTarget.id,
        body: { category_name: editName.trim() },
      });
      setEditTarget(null);
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not update category";
      Alert.alert("Update failed", msg);
    }
  }, [editName, editTarget, onChanged, updateCat]);

  const runDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteCat.mutateAsync(deleteConfirm.category.id);
      setDeleteConfirm(null);
      closeAll();
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      Alert.alert("Cannot delete", msg);
    } finally {
      setDeleting(false);
    }
  }, [closeAll, deleteCat, deleteConfirm, onChanged]);

  const menuOptions = useMemo(
    () => [
      { key: "timings", label: "Add custom category timings", onPress: handleTimings },
      { key: "edit_cat", label: "Edit category name", onPress: handleEditCategoryName },
      { key: "edit_sub", label: "Edit sub-category name", onPress: handleEditSubcategoryName },
      { key: "del_cat", label: "Delete category", onPress: handleDeleteCategory },
      { key: "del_sub", label: "Delete sub-category", onPress: handleDeleteSubcategory },
    ],
    [
      handleDeleteCategory,
      handleDeleteSubcategory,
      handleEditCategoryName,
      handleEditSubcategoryName,
      handleTimings,
    ],
  );

  if (!visible || !target) return null;

  const deleteTitle =
    deleteConfirm?.kind === "category"
      ? `Are you sure you want to delete ${deleteConfirm.category.category_name} ?`
      : deleteConfirm
        ? `Are you sure you want to delete '${deleteConfirm.category.category_name}' sub-category ?`
        : "";

  const deleteMessage =
    deleteConfirm?.kind === "category"
      ? "This will also remove all sub-categories and items under this category. This action cannot be undone."
      : deleteConfirm
        ? `This will also remove all items under '${deleteConfirm.category.category_name}' sub-category. This action cannot be undone.`
        : "";

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={closeAll}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeAll} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {headerTitle}
            </Text>
            <TouchableOpacity onPress={closeAll} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {menuOptions.map((opt, idx) => (
              <View key={opt.key}>
                <TouchableOpacity style={styles.menuRow} onPress={opt.onPress} activeOpacity={0.75}>
                  <Text style={styles.menuRowText}>{opt.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
                </TouchableOpacity>
                {idx < menuOptions.length - 1 ? <View style={styles.menuDivider} /> : null}
              </View>
            ))}
          </ScrollView>
        </View>

        {subcategoryPickerMode ? (
          <View style={styles.pickerOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSubcategoryPickerMode(null)} />
            <View style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <Text style={styles.pickerTitle}>
                {subcategoryPickerMode === "edit" ? "Select sub-category to edit" : "Select sub-category to delete"}
              </Text>
              {subcategories.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.pickerRow}
                  onPress={() => {
                    if (subcategoryPickerMode === "edit") {
                      openEditModal(sub);
                    } else {
                      setDeleteConfirm({ kind: "subcategory", category: sub });
                    }
                    setSubcategoryPickerMode(null);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.pickerRowText}>{sub.category_name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {editTarget ? (
          <View style={styles.confirmOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditTarget(null)} />
            <View style={styles.editCard} onStartShouldSetResponder={() => true}>
              <Text style={styles.editTitle}>
                {editTarget.parent_category_id != null ? "Edit sub-category name" : "Edit category name"}
              </Text>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Category name"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                maxLength={30}
                autoFocus
              />
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.editBtn, styles.editBtnSecondary]}
                  onPress={() => setEditTarget(null)}
                  disabled={updateCat.isPending}
                >
                  <Text style={styles.editBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editBtn, styles.editBtnPrimary]}
                  onPress={() => void handleSaveEdit()}
                  disabled={updateCat.isPending || !editName.trim()}
                >
                  {updateCat.isPending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.editBtnPrimaryText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {deleteConfirm ? (
          <View style={styles.confirmOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => !deleting && setDeleteConfirm(null)}
            />
            <View style={styles.deleteCard} onStartShouldSetResponder={() => true}>
              <View style={styles.deleteIconWrap}>
                <Ionicons name="trash" size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.deleteTitle}>{deleteTitle}</Text>
              <Text style={styles.deleteMessage}>{deleteMessage}</Text>
              <View style={styles.deleteActions}>
                <TouchableOpacity
                  style={styles.deleteActionBtn}
                  onPress={() => void runDelete()}
                  disabled={deleting}
                  activeOpacity={0.85}
                >
                  {deleting ? (
                    <ActivityIndicator color="#2563EB" size="small" />
                  ) : (
                    <Text style={styles.deleteActionPrimary}>Delete</Text>
                  )}
                </TouchableOpacity>
                <View style={styles.deleteDivider} />
                <TouchableOpacity
                  style={styles.deleteActionBtn}
                  onPress={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  activeOpacity={0.85}
                >
                  <Text style={styles.deleteActionSecondary}>Keep</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 14,
    paddingHorizontal: 16,
    maxHeight: "72%",
    ...GatiMitraMerchant.shadowSm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  closeBtn: {
    padding: 2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    gap: 12,
  },
  menuRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.border,
  },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 5,
  },
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: "50%",
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  pickerRowText: {
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    zIndex: 10,
  },
  deleteCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  deleteIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  deleteTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 10,
  },
  deleteMessage: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 18,
  },
  deleteActions: {
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  deleteActionBtn: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  deleteDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.border,
  },
  deleteActionPrimary: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563EB",
  },
  deleteActionSecondary: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  editCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    ...GatiMitraMerchant.shadowSm,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  editInput: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 16,
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  editBtnSecondary: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  editBtnPrimary: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  editBtnSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  editBtnPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
