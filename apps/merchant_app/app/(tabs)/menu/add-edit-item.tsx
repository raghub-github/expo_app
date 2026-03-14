/**
 * Add / Edit menu item — Zomato-style multi-section form.
 * Sections: Image, Category, Basic info, Pricing, Delivery, Nutritional info, Tags, Allergens.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Switch,
  Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  BUTTON_RADIUS,
  TAB_BAR_HEIGHT,
  SCROLL_BOTTOM_SAFE,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  useMenuCategories,
  useMenuItem,
  useCreateMenuItem,
  useUpdateMenuItem,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  menuKeys,
} from "@/hooks/useMenuQueries";
import { useQueryClient } from "@tanstack/react-query";
import {
  uploadItemImage,
  fetchStoreProfile,
  deleteMenuItem,
  createUpdateRequest,
  fetchItemModifierGroups,
  fetchModifierGroups,
  linkModifierGroupToItem,
  unlinkModifierGroupFromItem,
  type MenuItemPayload,
  type MenuCategory,
  type LinkedModifierGroup,
  type ModifierGroupRow,
} from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";

// ─── Constants ──────────────────────────────────────────────────────────────

const FOOD_TYPES = [
  { value: "VEG", label: "Veg", color: "#22C55E" },
  { value: "NON_VEG", label: "Non-Veg", color: "#EF4444" },
  { value: "EGG", label: "Egg", color: "#F59E0B" },
] as const;

const SERVES_OPTIONS = [
  "1 person",
  "1 - 2 people",
  "2 - 3 people",
  "3 - 4 people",
  "4 - 5 people",
  "5 - 6 people",
  "6 - 7 people",
  "7 - 8 people",
  "8 - 9 people",
] as const;

const SIZE_UNITS = [
  "slices", "kg", "litre", "ml", "serves", "cms", "piece", "grams", "inches",
] as const;

const WEIGHT_UNITS = ["grams", "kg", "oz", "lbs"] as const;
const NUTRIENT_UNITS = ["mg", "g"] as const;

const ALLERGENS_LIST = [
  "Gluten",
  "Crustacean",
  "Shellfish (crab, crayfish, lobster and shrimp)",
  "Tree nuts (almonds, walnuts and pecans)",
  "Soybeans",
  "Egg",
  "Peanut",
  "Milk",
  "Sulphite",
] as const;

// Item image: fixed ratio and size range (enforced in picker + validation)
const ITEM_IMAGE_ASPECT_RATIO = [1, 1] as const; // 1:1 square
const ITEM_IMAGE_MIN_WIDTH = 400;
const ITEM_IMAGE_MIN_HEIGHT = 400;
const ITEM_IMAGE_MAX_WIDTH = 2000;
const ITEM_IMAGE_MAX_HEIGHT = 2000;
const ITEM_IMAGE_MAX_FILE_SIZE_MB = 5;
const ITEM_IMAGE_MAX_FILE_SIZE_BYTES = ITEM_IMAGE_MAX_FILE_SIZE_MB * 1024 * 1024;

function parseOptionalNonNegativeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseServesFromLabel(label: string): number | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

const ITEM_TAGS_GROUPED: Record<string, string[]> = {
  Speciality: ["Freshly Frosted", "Pre Frosted", "Chef's Special"],
  "Spice Level": ["Medium Spicy", "Very Spicy"],
  Miscellaneous: ["Gluten Free", "Sugar Free", "Jain"],
  "Dietary Restrictions": ["Vegan"],
};

// ─── Bottom-sheet style modal ───────────────────────────────────────────────

function BottomModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <TouchableOpacity style={modalStyles.dismiss} onPress={onClose} activeOpacity={1} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          <TouchableOpacity style={modalStyles.confirmBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={modalStyles.confirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Section divider ────────────────────────────────────────────────────────

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

// ─── Dropdown trigger ───────────────────────────────────────────────────────

function DropdownField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label?: string;
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TouchableOpacity style={styles.dropdownTrigger} onPress={onPress} activeOpacity={0.7}>
        <Text style={value ? styles.dropdownValue : styles.dropdownPlaceholder}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={GatiMitraMerchant.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Value + Unit input ─────────────────────────────────────────────────────

function ValueUnitField({
  label,
  value,
  onChangeValue,
  unit,
  onPressUnit,
  placeholder,
  fixedUnit,
  helperText,
}: {
  label: string;
  value: string;
  onChangeValue: (v: string) => void;
  unit: string;
  onPressUnit?: () => void;
  placeholder: string;
  fixedUnit?: boolean;
  helperText?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.valueUnitRow}>
        <TextInput
          style={styles.valueInput}
          value={value}
          onChangeText={onChangeValue}
          placeholder={placeholder}
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          keyboardType="decimal-pad"
        />
        {fixedUnit ? (
          <View style={styles.unitFixed}>
            <Text style={styles.unitFixedText}>{unit}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.unitPicker} onPress={onPressUnit} activeOpacity={0.7}>
            <Text style={styles.unitPickerText}>{unit}</Text>
            <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function AddEditItemScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId?: string }>();
  const itemIdParam = params.itemId;
  const isEdit = itemIdParam != null;
  const itemId = isEdit ? parseInt(itemIdParam, 10) : null;

  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  // ── data loading (backend is source of truth; hooks provide cache) ──
  const { data: categories = [], refetch: refetchCategories } = useMenuCategories(storeId, token);
  const queryClient = useQueryClient();
  const { data: itemData, isLoading: loading, error: itemError } = useMenuItem(storeId, isEdit ? itemId : null, token);
  const createMutation = useCreateMenuItem(storeId, token);
  const updateMutation = useUpdateMenuItem(storeId, token);
  const createCategoryMutation = useCreateCategory(storeId, token);
  const updateCategoryMutation = useUpdateCategory(storeId, token);
  const deleteCategoryMutation = useDeleteCategory(storeId, token);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const saving = saveInProgress || createMutation.isPending || updateMutation.isPending;
  const loadError = itemError ? (itemError instanceof Error ? itemError.message : "Failed to load item") : null;
  const saveError = createMutation.error ?? updateMutation.error;
  const error = loadError ?? (saveError instanceof Error ? saveError.message : saveError ? "Save failed" : null);
  const [item, setItem] = useState<typeof itemData>(null);

  // ── form state ──
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [foodType, setFoodType] = useState<string>("VEG");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [cuisineType, setCuisineType] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("");
  const [packagingCharges, setPackagingCharges] = useState("");
  const [servesLabel, setServesLabel] = useState("");
  const [itemSizeValue, setItemSizeValue] = useState("");
  const [itemSizeUnit, setItemSizeUnit] = useState("piece");
  const [availableForDelivery, setAvailableForDelivery] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // nutritional
  const [weightPerServing, setWeightPerServing] = useState("");
  const [weightUnit, setWeightUnit] = useState("grams");
  const [caloriesKcal, setCaloriesKcal] = useState("");
  const [proteinVal, setProteinVal] = useState("");
  const [proteinUnit, setProteinUnit] = useState("mg");
  const [carbsVal, setCarbsVal] = useState("");
  const [carbsUnit, setCarbsUnit] = useState("mg");
  const [fatVal, setFatVal] = useState("");
  const [fatUnit, setFatUnit] = useState("mg");
  const [fibreVal, setFibreVal] = useState("");
  const [fibreUnit, setFibreUnit] = useState("mg");
  const [showNutritionExpanded, setShowNutritionExpanded] = useState(false);

  // allergens & tags
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // images (edit mode) + pending image (add mode: selected but not yet uploaded)
  const [images, setImages] = useState<Array<{ id: number; image_url: string; is_primary: boolean; display_order: number }>>([]);
  const [pendingImage, setPendingImage] = useState<{ uri: string; type?: string; name?: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // store cuisines (from onboarding) for optional cuisine picker
  const [storeCuisines, setStoreCuisines] = useState<string[]>([]);
  const [storeCuisinesLoading, setStoreCuisinesLoading] = useState(false);
  const [showCuisineModal, setShowCuisineModal] = useState(false);

  // category picker sheet (hierarchical list) + inline add/edit category
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categorySheetExpandedIds, setCategorySheetExpandedIds] = useState<Set<number>>(new Set());
  const [showCategoryFormModal, setShowCategoryFormModal] = useState(false);
  const [categoryFormMode, setCategoryFormMode] = useState<"add" | "add_sub" | "edit">("add");
  const [linkedModifierGroups, setLinkedModifierGroups] = useState<LinkedModifierGroup[]>([]);
  const [showLinkAddonPicker, setShowLinkAddonPicker] = useState(false);
  const [allModifierGroupsForPicker, setAllModifierGroupsForPicker] = useState<ModifierGroupRow[]>([]);
  const [linkingGroupId, setLinkingGroupId] = useState<number | null>(null);
  const [categoryFormParentId, setCategoryFormParentId] = useState<number | null>(null);
  const [categoryFormEditingId, setCategoryFormEditingId] = useState<number | null>(null);
  const [categoryFormName, setCategoryFormName] = useState("");
  const [categoryFormDescription, setCategoryFormDescription] = useState("");
  const [categoryFormOrder, setCategoryFormOrder] = useState("");

  // modals
  const [showServesModal, setShowServesModal] = useState(false);
  const [showSizeUnitModal, setShowSizeUnitModal] = useState(false);
  const [showAllergensModal, setShowAllergensModal] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [showWeightUnitModal, setShowWeightUnitModal] = useState(false);
  const [showProteinUnitModal, setShowProteinUnitModal] = useState(false);
  const [showCarbsUnitModal, setShowCarbsUnitModal] = useState(false);
  const [showFatUnitModal, setShowFatUnitModal] = useState(false);
  const [showFibreUnitModal, setShowFibreUnitModal] = useState(false);

  const canSave = Boolean(
    token && storeId && itemName.trim() && (sellingPrice.trim() || basePrice.trim()) && authorized
  );

  const categoryParentList = useMemo(
    () => categories.filter((c) => !c.parent_category_id).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [categories]
  );
  const categoryChildrenByParentId = useMemo(() => {
    const map = new Map<number, MenuCategory[]>();
    for (const c of categories) {
      if (c.parent_category_id == null) continue;
      const list = map.get(c.parent_category_id) ?? [];
      list.push(c);
      map.set(c.parent_category_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return map;
  }, [categories]);

  const toggleCategorySheetExpanded = useCallback((parentId: number) => {
    setCategorySheetExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  const openAddCategoryFromItem = useCallback(() => {
    setCategoryFormMode("add");
    setCategoryFormParentId(null);
    setCategoryFormEditingId(null);
    setCategoryFormName("");
    setCategoryFormDescription("");
    setCategoryFormOrder(String(categoryParentList.length));
    setShowCategoryFormModal(true);
  }, [categoryParentList.length]);

  const openAddSubcategoryFromItem = useCallback((parent: MenuCategory) => {
    setCategoryFormMode("add_sub");
    setCategoryFormParentId(parent.id);
    setCategoryFormEditingId(null);
    setCategoryFormName("");
    setCategoryFormDescription("");
    const siblings = categoryChildrenByParentId.get(parent.id) ?? [];
    setCategoryFormOrder(String(siblings.length));
    setShowCategoryFormModal(true);
  }, [categoryChildrenByParentId]);

  const openEditCategoryFromItem = useCallback((c: MenuCategory) => {
    setCategoryFormMode("edit");
    setCategoryFormParentId(c.parent_category_id ?? null);
    setCategoryFormEditingId(c.id);
    setCategoryFormName(c.category_name);
    setCategoryFormDescription(c.category_description ?? "");
    setCategoryFormOrder(String(c.display_order ?? 0));
    setShowCategoryFormModal(true);
  }, []);

  const handleSaveCategoryForm = useCallback(async () => {
    if (!storeId || !token || !categoryFormName.trim()) return;
    const order = parseInt(categoryFormOrder, 10) || 0;
    try {
      if (categoryFormMode === "edit" && categoryFormEditingId != null) {
        await updateCategoryMutation.mutateAsync({
          categoryId: categoryFormEditingId,
          body: {
            category_name: categoryFormName.trim(),
            category_description: categoryFormDescription.trim() || null,
            display_order: order,
            parent_category_id: categoryFormParentId ?? undefined,
          },
        });
      } else {
        await createCategoryMutation.mutateAsync({
          category_name: categoryFormName.trim(),
          category_description: categoryFormDescription.trim() || null,
          display_order: order,
          parent_category_id: categoryFormMode === "add_sub" && categoryFormParentId != null ? categoryFormParentId : undefined,
        });
      }
      await refetchCategories();
      setShowCategoryFormModal(false);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not save category.");
    }
  }, [
    storeId, token, categoryFormName, categoryFormDescription, categoryFormOrder,
    categoryFormMode, categoryFormEditingId, categoryFormParentId,
    createCategoryMutation, updateCategoryMutation, refetchCategories,
  ]);

  const handleDeleteCategoryFromItem = useCallback(
    (c: MenuCategory) => {
      Alert.alert(
        "Delete category",
        `Remove "${c.category_name}"? You can only delete when it has no items.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteCategoryMutation.mutateAsync(c.id);
                await refetchCategories();
                if (categoryId === c.id) setCategoryId(null);
                setShowCategorySheet(false);
              } catch (e) {
                Alert.alert("Cannot delete", e instanceof Error ? e.message : "Delete failed.");
              }
            },
          },
        ]
      );
    },
    [deleteCategoryMutation, refetchCategories, categoryId]
  );

  // Fetch store profile: cuisines + defaults for prep time & packaging (used when adding new item)
  useEffect(() => {
    if (!storeId || !token) return;
    let cancelled = false;
    setStoreCuisinesLoading(true);
    fetchStoreProfile(storeId, token)
      .then((r) => {
        if (cancelled) return;
        if (r.cuisine_types?.length) setStoreCuisines(r.cuisine_types);
        // Set default prep time and packaging from store only when not editing (add mode)
        if (!isEdit) {
          const storePrep = r.avg_preparation_time_minutes ?? 15;
          setPrepTimeMinutes(String(storePrep));
          const storePack = r.packaging_charge_amount ?? 0;
          setPackagingCharges(storePack > 0 ? String(storePack) : "");
        }
      })
      .catch(() => {
        if (!cancelled) setStoreCuisines([]);
      })
      .finally(() => {
        if (!cancelled) setStoreCuisinesLoading(false);
      });
    return () => { cancelled = true; };
  }, [storeId, token, isEdit]);

  // Linked addon groups (reusable modifier groups) when editing an item
  useEffect(() => {
    if (!storeId || !token || !isEdit || itemId == null || Number.isNaN(itemId)) return;
    let cancelled = false;
    fetchItemModifierGroups(storeId, itemId, token)
      .then((r) => { if (!cancelled) setLinkedModifierGroups(r.linkedModifierGroups ?? []); })
      .catch(() => { if (!cancelled) setLinkedModifierGroups([]); });
    return () => { cancelled = true; };
  }, [storeId, token, isEdit, itemId]);

  useEffect(() => {
    if (!showLinkAddonPicker || !storeId || !token) return;
    let cancelled = false;
    fetchModifierGroups(storeId, token)
      .then((r) => { if (!cancelled) setAllModifierGroupsForPicker(r.modifierGroups ?? []); })
      .catch(() => { if (!cancelled) setAllModifierGroupsForPicker([]); });
    return () => { cancelled = true; };
  }, [showLinkAddonPicker, storeId, token]);

  // Sync fetched item into form state (edit mode)
  useEffect(() => {
    if (!itemData || !isEdit) return;
    setItem(itemData);
    setItemName(itemData.item_name);
    setDescription(itemData.item_description ?? "");
    setFoodType(itemData.food_type ?? "VEG");
    setCategoryId(itemData.category_id ?? null);
    setCuisineType(itemData.cuisine_type ?? "");
    setBasePrice(itemData.base_price ?? "");
    setSellingPrice(itemData.selling_price ?? "");
    setPrepTimeMinutes(itemData.preparation_time_minutes != null ? String(itemData.preparation_time_minutes) : "");
    setPackagingCharges((itemData as { packaging_charges?: number | string | null }).packaging_charges != null ? String((itemData as any).packaging_charges) : "");
    setServesLabel(itemData.serves_label ?? "");
    setItemSizeValue(itemData.item_size_value != null ? String(itemData.item_size_value) : "");
    setItemSizeUnit(itemData.item_size_unit ?? "piece");
    setAvailableForDelivery(itemData.available_for_delivery ?? true);
    setWeightPerServing(itemData.weight_per_serving != null ? String(itemData.weight_per_serving) : "");
    setWeightUnit(itemData.weight_per_serving_unit ?? "grams");
    setCaloriesKcal(itemData.calories_kcal != null ? String(itemData.calories_kcal) : "");
    setProteinVal(itemData.protein != null ? String(itemData.protein) : "");
    setProteinUnit(itemData.protein_unit ?? "mg");
    setCarbsVal(itemData.carbohydrates != null ? String(itemData.carbohydrates) : "");
    setCarbsUnit(itemData.carbohydrates_unit ?? "mg");
    setFatVal(itemData.fat != null ? String(itemData.fat) : "");
    setFatUnit(itemData.fat_unit ?? "mg");
    setFibreVal(itemData.fibre != null ? String(itemData.fibre) : "");
    setFibreUnit(itemData.fibre_unit ?? "mg");
    setSelectedAllergens(itemData.allergens ?? []);
    setSelectedTags(itemData.item_tags ?? []);
    setImages(itemData.images ?? []);
    setAuthorized(true);
  }, [itemData, isEdit]);

  // ── image picker (fixed 1:1 ratio, size range); works in add mode (pending) and edit mode (upload) ──

  const openImagePicker = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if (perm?.status !== "granted" && perm?.status !== "undetermined") {
        Alert.alert("Permission needed", "Allow access to photos to add images.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: (ImagePicker as any).MediaTypeOptions?.Images ?? "images",
        allowsEditing: true,
        aspect: [...ITEM_IMAGE_ASPECT_RATIO],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const w = (asset as any).width ?? 0;
      const h = (asset as any).height ?? 0;
      if (w < ITEM_IMAGE_MIN_WIDTH || h < ITEM_IMAGE_MIN_HEIGHT) {
        Alert.alert(
          "Image too small",
          `Image must be at least ${ITEM_IMAGE_MIN_WIDTH}×${ITEM_IMAGE_MIN_HEIGHT} px. Current: ${w}×${h}. Please choose a larger image.`
        );
        return;
      }
      if (w > ITEM_IMAGE_MAX_WIDTH || h > ITEM_IMAGE_MAX_HEIGHT) {
        Alert.alert(
          "Image too large",
          `Image must be at most ${ITEM_IMAGE_MAX_WIDTH}×${ITEM_IMAGE_MAX_HEIGHT} px. Current: ${w}×${h}. Please choose a smaller image or crop.`
        );
        return;
      }
      const fileInfo = {
        uri: asset.uri,
        type: (asset as any).mimeType ?? "image/jpeg",
        name: (asset as any).fileName ?? "image.jpg",
      };
      // Add mode: store for upload after item is created
      if (!isEdit || itemId == null || Number.isNaN(itemId)) {
        setPendingImage(fileInfo);
        return;
      }
      // Edit mode: upload immediately (backend replaces previous primary image in R2)
      setUploadingImage(true);
      const uploaded = await uploadItemImage(storeId, itemId, token, fileInfo);
      setImages([
        { id: uploaded.id, image_url: uploaded.image_url, is_primary: true, display_order: 0 },
      ]);
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Could not upload image.");
    } finally {
      setUploadingImage(false);
    }
  }, [token, storeId, itemId, isEdit]);

  const removePendingImage = useCallback(() => {
    setPendingImage(null);
  }, []);

  // ── save ──

  const handleSaveConfirm = useCallback(() => {
    if (!token || !storeId || !itemName.trim()) return;
    const baseParsed = parseOptionalNonNegativeNumber(basePrice || "");
    const sellingParsed = parseOptionalNonNegativeNumber(sellingPrice || "");
    if (baseParsed == null && sellingParsed == null) {
      Alert.alert("Invalid price", "Enter a valid non-negative base or selling price.");
      return;
    }
    Alert.alert(
      isEdit ? "Save changes?" : "Create item?",
      isEdit ? "Your updates will be saved." : "This menu item will be added to your catalog.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Save", onPress: () => handleSave() },
      ]
    );
  }, [
    token, storeId, itemName, basePrice, sellingPrice, isEdit,
    handleSave,
  ]);

  const handleSave = useCallback(async () => {
    if (!token || !storeId || !itemName.trim()) return;
    const baseParsed = parseOptionalNonNegativeNumber(basePrice || "");
    const sellingParsed = parseOptionalNonNegativeNumber(sellingPrice || "");

    if (baseParsed == null && sellingParsed == null) {
      Alert.alert("Invalid price", "Enter a valid non-negative base or selling price.");
      return;
    }

    const base = baseParsed ?? sellingParsed ?? 0;
    const selling = sellingParsed ?? base;
    const servesNumber = servesLabel ? parseServesFromLabel(servesLabel) : null;

    const categoryIdNumber =
      categoryId != null
        ? (() => {
            const n = Number(categoryId);
            return !Number.isFinite(n) || n <= 0 ? null : n;
          })()
        : null;

    const prepMins = parseOptionalNonNegativeNumber(prepTimeMinutes);
    const packagingNum = parseOptionalNonNegativeNumber(packagingCharges);

    const payload: MenuItemPayload = {
      item_name: itemName.trim(),
      item_description: description.trim() || null,
      food_type: foodType,
      category_id: categoryIdNumber,
      cuisine_type: cuisineType.trim() || null,
      base_price: base,
      selling_price: selling,
      preparation_time_minutes: prepMins ?? null,
      packaging_charges: packagingNum ?? null,
      serves_label: servesLabel || null,
      serves: servesNumber,
      item_size_value: parseOptionalNonNegativeNumber(itemSizeValue || ""),
      item_size_unit: itemSizeUnit || null,
      available_for_delivery: availableForDelivery,
      weight_per_serving: parseOptionalNonNegativeNumber(weightPerServing || ""),
      weight_per_serving_unit: weightUnit,
      calories_kcal: parseOptionalNonNegativeNumber(caloriesKcal || ""),
      protein: parseOptionalNonNegativeNumber(proteinVal || ""),
      protein_unit: proteinUnit,
      carbohydrates: parseOptionalNonNegativeNumber(carbsVal || ""),
      carbohydrates_unit: carbsUnit,
      fat: parseOptionalNonNegativeNumber(fatVal || ""),
      fat_unit: fatUnit,
      fibre: parseOptionalNonNegativeNumber(fibreVal || ""),
      fibre_unit: fibreUnit,
      allergens: selectedAllergens.length ? selectedAllergens : null,
      item_tags: selectedTags.length ? selectedTags : null,
    };

    setSaveInProgress(true);
    try {
      if (isEdit && itemId != null) {
        const isApproved = itemData?.approval_status === "APPROVED";
        if (isApproved && storeId && token) {
          await createUpdateRequest(storeId, itemId, token, { requested_payload: payload });
          queryClient.invalidateQueries({ queryKey: menuKeys.items(storeId) });
          queryClient.invalidateQueries({ queryKey: menuKeys.item(storeId, itemId) });
          Alert.alert(
            "Update requested",
            "Your changes have been submitted for agent review. You will see them after approval.",
            [{ text: "OK", onPress: () => router.back() }]
          );
        } else {
          await updateMutation.mutateAsync({ itemId, body: payload });
          Alert.alert("Saved", "Item updated.", [{ text: "OK", onPress: () => router.back() }]);
        }
      } else {
        const created = await createMutation.mutateAsync(payload);
        const newId = created.id;
        if (pendingImage && token && storeId) {
          let rolledBack = false;
          try {
            await uploadItemImage(storeId, newId, token, {
              uri: pendingImage.uri,
              type: pendingImage.type ?? "image/jpeg",
              name: pendingImage.name ?? "image.jpg",
            });
          } catch (uploadErr) {
            try {
              await deleteMenuItem(storeId, newId, token);
              rolledBack = true;
            } catch {
              rolledBack = false;
            }
            Alert.alert(
              "Image upload failed",
              uploadErr instanceof Error
                ? rolledBack
                  ? `${uploadErr.message}. Item was not saved. Please try again.`
                  : `${uploadErr.message}. Item was created without image; you can edit or delete it from the catalog.`
                : rolledBack
                  ? "Could not upload image. Item was not saved. Please try again."
                  : "Could not upload image. Item was created without image; you can edit or delete it from the catalog."
            );
            if (rolledBack) {
              return;
            }
          }
        }
        Alert.alert("Created", "Item added.", [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]);
      }
    } catch {
      // Error surfaced via mutation.error / derived error state
    } finally {
      setSaveInProgress(false);
    }
  }, [
    storeId, isEdit, itemId, itemName, description, foodType, categoryId, cuisineType, pendingImage, token,
    basePrice, sellingPrice, prepTimeMinutes, packagingCharges, servesLabel, itemSizeValue, itemSizeUnit,
    availableForDelivery, weightPerServing, weightUnit, caloriesKcal,
    proteinVal, proteinUnit, carbsVal, carbsUnit, fatVal, fatUnit,
    fibreVal, fibreUnit, selectedAllergens, selectedTags, router,
    createMutation, updateMutation, itemData?.approval_status,
  ]);

  // ── category helpers ──
  const categoryLabel = useMemo(() => {
    if (categoryId == null) return "";
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return "";
    const parent = cat.parent_category_id
      ? categories.find((c) => c.id === cat.parent_category_id)
      : null;
    return parent ? `${parent.category_name} (${cat.category_name})` : cat.category_name;
  }, [categoryId, categories]);

  const allergensLabel = useMemo(
    () => (selectedAllergens.length ? selectedAllergens.join(", ") : ""),
    [selectedAllergens]
  );

  const tagsLabel = useMemo(
    () => (selectedTags.length ? selectedTags.join(", ") : ""),
    [selectedTags]
  );

  // ── early returns ──

  if (!storeId || !token) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.placeholderText}>Select a store and sign in.</Text>
      </View>
    );
  }

  if (loading && isEdit) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
      </View>
    );
  }

  // ── render ──

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Item details</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + SCROLL_BOTTOM_SAFE + insets.bottom + 80 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── Image upload (fixed ratio & size); opens gallery in both add and edit mode ── */}
        <TouchableOpacity
          style={styles.imageUploadArea}
          onPress={openImagePicker}
          activeOpacity={0.8}
          disabled={uploadingImage}
        >
          {images.length > 0 ? (
            <Image
              source={{ uri: resolveImageUrl(images[0].image_url) ?? images[0].image_url }}
              style={styles.imagePreview}
              resizeMode="cover"
            />
          ) : pendingImage ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} resizeMode="cover" />
              <TouchableOpacity style={styles.removePendingBtn} onPress={removePendingImage} hitSlop={8}>
                <Ionicons name="close-circle" size={28} color={GatiMitraMerchant.error} />
              </TouchableOpacity>
            </View>
          ) : uploadingImage ? (
            <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={40} color={GatiMitraMerchant.primary} />
              <Text style={styles.imageUploadLabel}>Add Image</Text>
              <Text style={styles.imageUploadHint}>Tap to open gallery · Items with images get more orders</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.imageRequirements}>
          Ratio 1:1 · {ITEM_IMAGE_MIN_WIDTH}–{ITEM_IMAGE_MAX_WIDTH} px (width & height) · max {ITEM_IMAGE_MAX_FILE_SIZE_MB} MB
        </Text>

        {images.length > 1 && (
          <ScrollView horizontal style={styles.thumbnailScroll} showsHorizontalScrollIndicator={false}>
            {images.map((img) => (
              <View key={img.id} style={styles.thumbnailWrap}>
                <Image
                  source={{ uri: resolveImageUrl(img.image_url) ?? img.image_url }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
                {img.is_primary && (
                  <View style={styles.primaryBadge}>
                    <Text style={styles.primaryBadgeText}>Primary</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {isEdit && itemId != null ? (
          <>
            <View style={styles.manageOptionsCard}>
              <Text style={styles.manageOptionsTitle}>Options</Text>
              <View style={styles.manageOptionsRow}>
                <TouchableOpacity
                  style={styles.manageOptionBtn}
                  onPress={() => router.push({ pathname: "/menu/item-variants", params: { itemId: String(itemId) } } as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="swap-horizontal" size={18} color={GatiMitraMerchant.primary} />
                  <Text style={styles.manageOptionBtnText}>Variants</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.manageOptionBtn}
                  onPress={() => router.push({ pathname: "/menu/item-customizations", params: { itemId: String(itemId) } } as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="options-outline" size={18} color={GatiMitraMerchant.primary} />
                  <Text style={styles.manageOptionBtnText}>Customizations & add-ons</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.manageOptionsHint}>For approved items, changes will go for review.</Text>
            </View>

            <View style={styles.manageOptionsCard}>
              <Text style={styles.manageOptionsTitle}>Linked Addon Groups</Text>
              <Text style={styles.manageOptionsHint}>Reusable addon groups from your Addon Library. Link once, use on many items.</Text>
              {linkedModifierGroups.length > 0 && (
                <View style={styles.linkedAddonsList}>
                  {linkedModifierGroups.map((link) => (
                    <View key={link.id} style={styles.linkedAddonRow}>
                      <View style={styles.linkedAddonInfo}>
                        <Text style={styles.linkedAddonTitle} numberOfLines={1}>{link.group.title}</Text>
                        <Text style={styles.linkedAddonMeta}>{link.group.options?.length ?? 0} option(s)</Text>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          if (!storeId || !token || itemId == null) return;
                          try {
                            await unlinkModifierGroupFromItem(storeId, itemId, link.id, token);
                            const r = await fetchItemModifierGroups(storeId, itemId, token);
                            setLinkedModifierGroups(r.linkedModifierGroups ?? []);
                          } catch (e) {
                            Alert.alert("Error", e instanceof Error ? e.message : "Could not unlink.");
                          }
                        }}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={22} color={GatiMitraMerchant.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.manageOptionsRow}>
                <TouchableOpacity
                  style={styles.manageOptionBtn}
                  onPress={() => setShowLinkAddonPicker(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="link" size={18} color={GatiMitraMerchant.primary} />
                  <Text style={styles.manageOptionBtnText}>Add existing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.manageOptionBtn}
                  onPress={() => router.push("/menu/addon-library" as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={18} color={GatiMitraMerchant.primary} />
                  <Text style={styles.manageOptionBtnText}>Create new</Text>
                </TouchableOpacity>
              </View>
            </View>
            <SectionDivider />
          </>
        ) : (
          <SectionDivider />
        )}

        {/* Link addon group picker modal */}
        <Modal visible={showLinkAddonPicker} transparent animationType="slide">
          <View style={modalStyles.overlay}>
            <TouchableOpacity style={modalStyles.dismiss} onPress={() => setShowLinkAddonPicker(false)} activeOpacity={1} />
            <View style={[modalStyles.sheet, { maxHeight: "70%" }]}>
              <View style={modalStyles.header}>
                <Text style={modalStyles.title}>Add existing addon group</Text>
                <TouchableOpacity onPress={() => setShowLinkAddonPicker(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
                {allModifierGroupsForPicker
                  .filter((g) => !linkedModifierGroups.some((l) => l.modifier_group_id === g.id))
                  .map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[modalStyles.optionRow, linkingGroupId === g.id && { opacity: 0.6 }]}
                      onPress={async () => {
                        if (!storeId || !token || itemId == null) return;
                        setLinkingGroupId(g.id);
                        try {
                          await linkModifierGroupToItem(storeId, itemId, token, { modifier_group_id: g.id });
                          const r = await fetchItemModifierGroups(storeId, itemId, token);
                          setLinkedModifierGroups(r.linkedModifierGroups ?? []);
                          setShowLinkAddonPicker(false);
                        } catch (e) {
                          Alert.alert("Error", e instanceof Error ? e.message : "Could not link.");
                        } finally {
                          setLinkingGroupId(null);
                        }
                      }}
                      disabled={linkingGroupId != null}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalOptionText} numberOfLines={1}>{g.title}</Text>
                        <Text style={styles.modalOptionMeta}>{g.options_count} options · Used in {g.used_in_items_count} items</Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={GatiMitraMerchant.primary} />
                    </TouchableOpacity>
                  ))}
                {allModifierGroupsForPicker.filter((g) => !linkedModifierGroups.some((l) => l.modifier_group_id === g.id)).length === 0 && (
                  <Text style={styles.modalEmpty}>No other addon groups to link. Create one in Addon Library.</Text>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── Category (subcategory): sheet with hierarchical list + add/edit/delete ── */}
        <View style={styles.section}>
          <DropdownField
            label="Category (sub-category)"
            value={categoryLabel}
            placeholder="Select a category or subcategory"
            onPress={() => {
              setCategorySearch("");
              setCategorySheetExpandedIds((prev) => {
                const next = new Set(prev);
                categoryParentList.forEach((p) => next.add(p.id));
                return next;
              });
              setShowCategorySheet(true);
            }}
          />
        </View>

        {/* Category picker sheet: hierarchical list, search, add/edit/delete */}
        <Modal visible={showCategorySheet} transparent animationType="slide">
          <View style={modalStyles.overlay}>
            <TouchableOpacity style={modalStyles.dismiss} onPress={() => setShowCategorySheet(false)} activeOpacity={1} />
            <View style={[modalStyles.sheet, { maxHeight: "85%" }]}>
              <View style={modalStyles.header}>
                <Text style={modalStyles.title}>Select category</Text>
                <TouchableOpacity onPress={() => setShowCategorySheet(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                </TouchableOpacity>
              </View>
              <View style={styles.categorySheetSearchWrap}>
                <Ionicons name="search-outline" size={20} color={GatiMitraMerchant.textTertiary} />
                <TextInput
                  style={styles.categorySheetSearchInput}
                  placeholder="Search categories..."
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  value={categorySearch}
                  onChangeText={setCategorySearch}
                />
                {categorySearch.length > 0 && (
                  <TouchableOpacity onPress={() => setCategorySearch("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={GatiMitraMerchant.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={styles.categorySheetList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <TouchableOpacity
                  style={[modalStyles.optionRow, categoryId === null && styles.categorySheetRowActive]}
                  onPress={() => { setCategoryId(null); setShowCategorySheet(false); }}
                >
                  <Text style={[modalStyles.optionText, categoryId === null && styles.categorySheetRowActiveText]}>None</Text>
                  {categoryId === null && <Ionicons name="checkmark-circle" size={22} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
                {categoryParentList
                  .filter((p) => !categorySearch.trim() || p.category_name.toLowerCase().includes(categorySearch.trim().toLowerCase()))
                  .map((parent) => {
                    const children = categoryChildrenByParentId.get(parent.id) ?? [];
                    const filteredChildren = categorySearch.trim()
                      ? children.filter((ch) => ch.category_name.toLowerCase().includes(categorySearch.trim().toLowerCase()))
                      : children;
                    const isExpanded = categorySheetExpandedIds.has(parent.id);
                    const showParent = !categorySearch.trim() || parent.category_name.toLowerCase().includes(categorySearch.trim().toLowerCase());
                    if (!showParent && filteredChildren.length === 0) return null;
                    return (
                      <View key={parent.id} style={styles.categorySheetParentBlock}>
                        <View style={[modalStyles.optionRow, styles.categorySheetParentRow]}>
                          <TouchableOpacity onPress={() => toggleCategorySheetExpanded(parent.id)} style={styles.categorySheetChevron}>
                            <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={20} color={GatiMitraMerchant.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.categorySheetNameWrap, categoryId === parent.id && styles.categorySheetRowActive]}
                            onPress={() => { setCategoryId(parent.id); setShowCategorySheet(false); }}
                          >
                            <Text style={[modalStyles.optionText, categoryId === parent.id && styles.categorySheetRowActiveText]} numberOfLines={1}>{parent.category_name}</Text>
                            {categoryId === parent.id && <Ionicons name="checkmark-circle" size={22} color={GatiMitraMerchant.primary} />}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => openEditCategoryFromItem(parent)} style={styles.categorySheetActionBtn} hitSlop={8}>
                            <Ionicons name="pencil" size={18} color={GatiMitraMerchant.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCategoryFromItem(parent)} style={styles.categorySheetActionBtn} hitSlop={8}>
                            <Ionicons name="trash-outline" size={18} color={GatiMitraMerchant.error} />
                          </TouchableOpacity>
                        </View>
                        {isExpanded && (
                          <>
                            {filteredChildren.map((child) => (
                              <View key={child.id} style={[modalStyles.optionRow, styles.categorySheetChildRow]}>
                                <TouchableOpacity
                                  style={[styles.categorySheetNameWrap, categoryId === child.id && styles.categorySheetRowActive]}
                                  onPress={() => { setCategoryId(child.id); setShowCategorySheet(false); }}
                                >
                                  <Text style={[modalStyles.optionText, categoryId === child.id && styles.categorySheetRowActiveText]} numberOfLines={1}>{child.category_name}</Text>
                                  {categoryId === child.id && <Ionicons name="checkmark-circle" size={22} color={GatiMitraMerchant.primary} />}
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => openEditCategoryFromItem(child)} style={styles.categorySheetActionBtn} hitSlop={8}>
                                  <Ionicons name="pencil" size={16} color={GatiMitraMerchant.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleDeleteCategoryFromItem(child)} style={styles.categorySheetActionBtn} hitSlop={8}>
                                  <Ionicons name="trash-outline" size={16} color={GatiMitraMerchant.error} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            <TouchableOpacity style={styles.categorySheetAddSubRow} onPress={() => openAddSubcategoryFromItem(parent)}>
                              <Ionicons name="add-circle-outline" size={18} color={GatiMitraMerchant.primary} />
                              <Text style={styles.categorySheetAddSubText}>Add subcategory under {parent.category_name}</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    );
                  })}
              </ScrollView>
              <TouchableOpacity style={styles.categorySheetAddMainBtn} onPress={openAddCategoryFromItem}>
                <Ionicons name="add-circle" size={22} color={GatiMitraMerchant.primary} />
                <Text style={styles.categorySheetAddMainText}>Add main category</Text>
              </TouchableOpacity>
              <TouchableOpacity style={modalStyles.confirmBtn} onPress={() => setShowCategorySheet(false)}>
                <Text style={modalStyles.confirmText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Inline add/edit category form (from add-item page) */}
        <Modal visible={showCategoryFormModal} transparent animationType="fade">
          <View style={[modalStyles.overlay, { justifyContent: "center" }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowCategoryFormModal(false)} />
            <View style={[modalStyles.sheet, { marginHorizontal: 20, maxHeight: "80%" }]} onStartShouldSetResponder={() => true}>
              <View style={modalStyles.header}>
                <Text style={modalStyles.title}>
                  {categoryFormMode === "edit" ? "Edit category" : categoryFormMode === "add_sub" ? "Add subcategory" : "Add category"}
                </Text>
                <TouchableOpacity onPress={() => setShowCategoryFormModal(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ paddingHorizontal: H_PADDING }} showsVerticalScrollIndicator={false}>
                {categoryFormMode !== "add_sub" ? (
                  <>
                    <Text style={styles.fieldLabel}>Parent (optional)</Text>
                    <View style={styles.categoryFormParentChips}>
                      <TouchableOpacity
                        style={[styles.categoryFormChip, categoryFormParentId === null && styles.categoryFormChipActive]}
                        onPress={() => setCategoryFormParentId(null)}
                      >
                        <Text style={[styles.categoryFormChipText, categoryFormParentId === null && styles.categoryFormChipTextActive]}>None (main)</Text>
                      </TouchableOpacity>
                      {categoryParentList.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.categoryFormChip, categoryFormParentId === p.id && styles.categoryFormChipActive]}
                          onPress={() => setCategoryFormParentId(p.id)}
                        >
                          <Text style={[styles.categoryFormChipText, categoryFormParentId === p.id && styles.categoryFormChipTextActive]}>{p.category_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.fieldLabel}>Under: {categoryParentList.find((p) => p.id === categoryFormParentId)?.category_name ?? ""}</Text>
                )}
                <Text style={styles.fieldLabel}>Category name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Biriyani"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  value={categoryFormName}
                  onChangeText={setCategoryFormName}
                />
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.textInput, { minHeight: 60 }]}
                  placeholder="Short description"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  value={categoryFormDescription}
                  onChangeText={setCategoryFormDescription}
                  multiline
                />
                <Text style={styles.fieldLabel}>Display order</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="0"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  value={categoryFormOrder}
                  onChangeText={setCategoryFormOrder}
                  keyboardType="number-pad"
                />
                <View style={styles.categoryFormButtons}>
                  <TouchableOpacity style={styles.categoryFormCancelBtn} onPress={() => setShowCategoryFormModal(false)}>
                    <Text style={styles.modalBtnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.categoryFormSaveBtn, !categoryFormName.trim() && styles.saveBtnDisabled]}
                    onPress={handleSaveCategoryForm}
                    disabled={!categoryFormName.trim() || createCategoryMutation.isPending || updateCategoryMutation.isPending}
                  >
                    {createCategoryMutation.isPending || updateCategoryMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalBtnSaveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── Cuisine (optional; from store onboarding) ── */}
        <View style={styles.section}>
          <DropdownField
            label="Cuisine (optional)"
            value={storeCuisinesLoading ? "Loading…" : (cuisineType || "None")}
            placeholder={storeCuisines.length ? "Select cuisine" : storeCuisinesLoading ? "Loading…" : "No cuisines set for store"}
            onPress={() => {
              if (storeCuisinesLoading) return;
              if (storeCuisines.length === 0) {
                Alert.alert(
                  "No cuisines",
                  "Cuisines are set during store onboarding. Add or edit your store cuisines in profile/settings, then you can assign them to items here."
                );
                return;
              }
              setShowCuisineModal(true);
            }}
          />
        </View>

        <BottomModal visible={showCuisineModal} title="Select cuisine" onClose={() => setShowCuisineModal(false)}>
          <TouchableOpacity
            style={modalStyles.optionRow}
            onPress={() => { setCuisineType(""); setShowCuisineModal(false); }}
          >
            <Text style={modalStyles.optionText}>None</Text>
            {!cuisineType ? <Ionicons name="checkmark" size={20} color={GatiMitraMerchant.primary} /> : null}
          </TouchableOpacity>
          {storeCuisines.map((c) => (
            <TouchableOpacity
              key={c}
              style={modalStyles.optionRow}
              onPress={() => { setCuisineType(c); setShowCuisineModal(false); }}
            >
              <Text style={modalStyles.optionText}>{c}</Text>
              {cuisineType === c ? <Ionicons name="checkmark" size={20} color={GatiMitraMerchant.primary} /> : null}
            </TouchableOpacity>
          ))}
        </BottomModal>

        {/* ── Item name ── */}
        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Item name</Text>
          <View style={styles.inputWithIcon}>
            <TextInput
              style={styles.textInput}
              value={itemName}
              onChangeText={(t) => t.length <= 70 ? setItemName(t) : null}
              placeholder="Eg: Veg burger"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
            <Ionicons name="pencil-outline" size={18} color={GatiMitraMerchant.textTertiary} />
          </View>
          <Text style={styles.charCount}>{itemName.length} / 70</Text>
        </View>

        {/* ── Serves info ── */}
        <DropdownField
          label="Serves info, select no. of people"
          value={servesLabel}
          placeholder="Serves eg. 1-2 people"
          onPress={() => setShowServesModal(true)}
        />
        <Text style={styles.helperText}>Number of adults who can be served with 1 item</Text>

        {/* ── Item size ── */}
        <ValueUnitField
          label="Item size"
          value={itemSizeValue}
          onChangeValue={setItemSizeValue}
          unit={itemSizeUnit}
          onPressUnit={() => setShowSizeUnitModal(true)}
          placeholder="Eg. 4"
          helperText="Size of the item e.g. Paneer Tikka, 8 pieces"
        />

        <SectionDivider />

        {/* ── Description ── */}
        <View style={styles.section}>
          <Text style={styles.fieldLabel}>Item description</Text>
          <View style={styles.inputWithIcon}>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={(t) => t.length <= 500 ? setDescription(t) : null}
              placeholder="Eg: Yummy veg paneer burger with a soft patty, veggies, cheese, and special sauce"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              multiline
              numberOfLines={3}
            />
            <Ionicons name="pencil-outline" size={18} color={GatiMitraMerchant.textTertiary} style={{ alignSelf: "flex-start", marginTop: 14 }} />
          </View>
          <View style={styles.descRow}>
            {description.length < 5 && description.length > 0 ? (
              <Text style={styles.descWarning}>Min 5 characters required</Text>
            ) : (
              <View />
            )}
            <Text style={styles.charCount}>{description.length} / 500</Text>
          </View>
        </View>

        {/* ── Food type ── */}
        <View style={styles.foodTypeRow}>
          {FOOD_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              onPress={() => setFoodType(t.value)}
              style={[styles.foodChip, foodType === t.value && { borderColor: t.color, borderWidth: 2 }]}
              activeOpacity={0.8}
            >
              <View style={[styles.foodDot, { backgroundColor: t.color }]} />
              <Text style={[styles.foodChipText, foodType === t.value && { color: t.color, fontWeight: "700" }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionDivider />

        {/* ── Item price ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Item price</Text>
          <View style={styles.inputWithIcon}>
            <TextInput
              style={styles.textInput}
              value={basePrice}
              onChangeText={setBasePrice}
              placeholder="Base price"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              keyboardType="decimal-pad"
            />
            <Ionicons name="pencil-outline" size={18} color={GatiMitraMerchant.textTertiary} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.inputWithIcon}>
            <TextInput
              style={styles.textInput}
              value={sellingPrice}
              onChangeText={setSellingPrice}
              placeholder="Selling price"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              keyboardType="decimal-pad"
            />
            <Ionicons name="pencil-outline" size={18} color={GatiMitraMerchant.textTertiary} />
          </View>
        </View>

        {/* ── Prep time & packaging (default from store, editable per item) ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Prep time & packaging</Text>
          <Text style={styles.sectionSubheading}>
            Defaults are from your store settings. Change here only if this item is different.
          </Text>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Prep time (minutes)</Text>
            <TextInput
              style={styles.textInput}
              value={prepTimeMinutes}
              onChangeText={setPrepTimeMinutes}
              placeholder="e.g. 15"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Packaging charges (₹)</Text>
            <TextInput
              style={styles.textInput}
              value={packagingCharges}
              onChangeText={setPackagingCharges}
              placeholder="e.g. 0"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <SectionDivider />

        {/* ── Available on ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Item available on</Text>
          <View style={styles.deliveryRow}>
            <Ionicons name="bicycle-outline" size={22} color={GatiMitraMerchant.textPrimary} />
            <Text style={styles.deliveryLabel}>Delivery</Text>
            <Switch
              value={availableForDelivery}
              onValueChange={setAvailableForDelivery}
              trackColor={{ false: GatiMitraMerchant.border, true: GatiMitraMerchant.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <SectionDivider />

        {/* ── Nutritional info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Nutritional info per serving</Text>
          <Text style={styles.sectionSubheading}>Per serving is corresponding to 1 adult</Text>

          <ValueUnitField
            label="Weight per serving"
            value={weightPerServing}
            onChangeValue={setWeightPerServing}
            unit={weightUnit}
            onPressUnit={() => setShowWeightUnitModal(true)}
            placeholder="Eg. 500"
          />

          <ValueUnitField
            label="Calorie count"
            value={caloriesKcal}
            onChangeValue={setCaloriesKcal}
            unit="Kcal"
            placeholder="Eg. 300"
            fixedUnit
          />

          <ValueUnitField
            label="Protein count"
            value={proteinVal}
            onChangeValue={setProteinVal}
            unit={proteinUnit}
            onPressUnit={() => setShowProteinUnitModal(true)}
            placeholder="Eg. 50"
          />

          {showNutritionExpanded && (
            <>
              <ValueUnitField
                label="Carbohydrates"
                value={carbsVal}
                onChangeValue={setCarbsVal}
                unit={carbsUnit}
                onPressUnit={() => setShowCarbsUnitModal(true)}
                placeholder="Eg. 100"
              />
              <ValueUnitField
                label="Fat count"
                value={fatVal}
                onChangeValue={setFatVal}
                unit={fatUnit}
                onPressUnit={() => setShowFatUnitModal(true)}
                placeholder="Eg. 300"
              />
              <ValueUnitField
                label="Fibre count"
                value={fibreVal}
                onChangeValue={setFibreVal}
                unit={fibreUnit}
                onPressUnit={() => setShowFibreUnitModal(true)}
                placeholder="Eg. 10"
              />
            </>
          )}

          {!showNutritionExpanded && (
            <TouchableOpacity
              style={styles.viewMoreBtn}
              onPress={() => setShowNutritionExpanded(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.viewMoreText}>View more</Text>
            </TouchableOpacity>
          )}

          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>Calculation Tips:</Text>
            <Text style={styles.tipsText}>
              1. Calories (kcal) is generally equal to 4 x Protein (in g) + 4 x Carbs (in g) + 9 x Fats (in g)
            </Text>
            <Text style={styles.tipsText}>2. Partial information would not be shown to the customer</Text>
          </View>
        </View>

        {/* ── Allergens ── */}
        <DropdownField
          label="Allergens"
          value={allergensLabel}
          placeholder="Eg. Milk"
          onPress={() => setShowAllergensModal(true)}
        />

        {/* ── Tags ── */}
        <DropdownField
          label="Select item tags"
          value={tagsLabel}
          placeholder="Select item tags"
          onPress={() => setShowTagsModal(true)}
        />
      </ScrollView>

      {/* ── Sticky footer ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.authRow}
          onPress={() => setAuthorized(!authorized)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={authorized ? "checkbox" : "square-outline"}
            size={24}
            color={authorized ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
          />
          <Text style={styles.authText}>
            I am authorized to make menu edits & responsible for the information shared including item details & prices
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
          onPress={handleSaveConfirm}
          disabled={!canSave || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Modals ── */}

      {/* Serves */}
      <BottomModal visible={showServesModal} title="Serves info, select no. of people" onClose={() => setShowServesModal(false)}>
        {SERVES_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={styles.radioRow}
            onPress={() => setServesLabel(opt)}
            activeOpacity={0.7}
          >
            <Text style={styles.radioLabel}>{opt}</Text>
            <Ionicons
              name={servesLabel === opt ? "radio-button-on" : "radio-button-off"}
              size={24}
              color={servesLabel === opt ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
            />
          </TouchableOpacity>
        ))}
      </BottomModal>

      {/* Size unit */}
      <BottomModal visible={showSizeUnitModal} title="Item size" onClose={() => setShowSizeUnitModal(false)}>
        {SIZE_UNITS.map((u) => (
          <TouchableOpacity
            key={u}
            style={styles.radioRow}
            onPress={() => setItemSizeUnit(u)}
            activeOpacity={0.7}
          >
            <Text style={styles.radioLabel}>{u}</Text>
            <Ionicons
              name={itemSizeUnit === u ? "radio-button-on" : "radio-button-off"}
              size={24}
              color={itemSizeUnit === u ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
            />
          </TouchableOpacity>
        ))}
      </BottomModal>

      {/* Allergens */}
      <BottomModal visible={showAllergensModal} title="Allergens" onClose={() => setShowAllergensModal(false)}>
        {ALLERGENS_LIST.map((a) => {
          const checked = selectedAllergens.includes(a);
          return (
            <TouchableOpacity
              key={a}
              style={styles.checkRow}
              onPress={() =>
                setSelectedAllergens((prev) =>
                  checked ? prev.filter((x) => x !== a) : [...prev, a]
                )
              }
              activeOpacity={0.7}
            >
              <Text style={styles.checkLabel}>{a}</Text>
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={24}
                color={checked ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
              />
            </TouchableOpacity>
          );
        })}
      </BottomModal>

      {/* Tags */}
      <BottomModal visible={showTagsModal} title="Select item tags" onClose={() => setShowTagsModal(false)}>
        {Object.entries(ITEM_TAGS_GROUPED).map(([group, tags]) => (
          <View key={group} style={styles.tagGroup}>
            <Text style={styles.tagGroupTitle}>{group}</Text>
            <View style={styles.tagChipsRow}>
              {tags.map((t) => {
                const active = selectedTags.includes(t);
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tagChip, active && styles.tagChipActive]}
                    onPress={() =>
                      setSelectedTags((prev) =>
                        active ? prev.filter((x) => x !== t) : [...prev, t]
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </BottomModal>

      {/* Unit modals (reusable pattern) */}
      {[
        { vis: showWeightUnitModal, set: setShowWeightUnitModal, units: WEIGHT_UNITS, val: weightUnit, setVal: setWeightUnit, title: "Weight unit" },
        { vis: showProteinUnitModal, set: setShowProteinUnitModal, units: NUTRIENT_UNITS, val: proteinUnit, setVal: setProteinUnit, title: "Protein unit" },
        { vis: showCarbsUnitModal, set: setShowCarbsUnitModal, units: NUTRIENT_UNITS, val: carbsUnit, setVal: setCarbsUnit, title: "Carbs unit" },
        { vis: showFatUnitModal, set: setShowFatUnitModal, units: NUTRIENT_UNITS, val: fatUnit, setVal: setFatUnit, title: "Fat unit" },
        { vis: showFibreUnitModal, set: setShowFibreUnitModal, units: NUTRIENT_UNITS, val: fibreUnit, setVal: setFibreUnit, title: "Fibre unit" },
      ].map((m) => (
        <BottomModal key={m.title} visible={m.vis} title={m.title} onClose={() => m.set(false)}>
          {(m.units as readonly string[]).map((u) => (
            <TouchableOpacity
              key={u}
              style={styles.radioRow}
              onPress={() => m.setVal(u)}
              activeOpacity={0.7}
            >
              <Text style={styles.radioLabel}>{u}</Text>
              <Ionicons
                name={m.val === u ? "radio-button-on" : "radio-button-off"}
                size={24}
                color={m.val === u ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
              />
            </TouchableOpacity>
          ))}
        </BottomModal>
      ))}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  centered: { justifyContent: "center", alignItems: "center" },
  placeholderText: { fontSize: 14, color: GatiMitraMerchant.textSecondary },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  headerBtn: { width: 32 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },

  scroll: { flex: 1 },

  errorWrap: { margin: H_PADDING, marginBottom: 0 },
  errorText: { fontSize: 14, color: GatiMitraMerchant.error },

  imageUploadArea: {
    marginHorizontal: H_PADDING,
    marginTop: 16,
    width: SCREEN_WIDTH - H_PADDING * 2,
    aspectRatio: 1,
    borderRadius: CARD_RADIUS,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: "100%" },
  imagePreviewWrap: { width: "100%", height: "100%", position: "relative" },
  removePendingBtn: { position: "absolute", top: 8, right: 8, zIndex: 1 },
  imageUploadLabel: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.primary, marginTop: 8 },
  imageUploadHint: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 4 },
  imageRequirements: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 6,
    marginHorizontal: H_PADDING,
  },
  manageOptionsCard: {
    marginTop: 12,
    marginHorizontal: H_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    gap: 10,
  },
  manageOptionsTitle: { fontSize: 14, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  manageOptionsRow: { flexDirection: "row", gap: 10 },
  manageOptionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  manageOptionBtnText: { fontSize: 13, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  manageOptionsHint: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  linkedAddonsList: { marginBottom: 12, gap: 0 },
  linkedAddonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  linkedAddonInfo: { flex: 1, minWidth: 0 },
  linkedAddonTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  linkedAddonMeta: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  modalOptionText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  modalOptionMeta: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  modalEmpty: { fontSize: 13, color: GatiMitraMerchant.textTertiary, paddingVertical: 20, textAlign: "center" },
  categorySheetSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: H_PADDING,
    marginBottom: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  categorySheetSearchInput: { flex: 1, fontSize: 15, color: GatiMitraMerchant.textPrimary, paddingVertical: 0 },
  categorySheetList: { maxHeight: 320, paddingHorizontal: H_PADDING },
  categorySheetRowActive: { backgroundColor: GatiMitraMerchant.primaryLight + "40" },
  categorySheetRowActiveText: { fontWeight: "700", color: GatiMitraMerchant.primary },
  categorySheetParentBlock: { marginBottom: 4 },
  categorySheetParentRow: { paddingVertical: 12 },
  categorySheetChevron: { padding: 4, marginRight: 4 },
  categorySheetNameWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categorySheetActionBtn: { padding: 4 },
  categorySheetChildRow: { paddingVertical: 10, paddingLeft: 32, backgroundColor: GatiMitraMerchant.surfaceSubtle },
  categorySheetAddSubRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingLeft: 32 },
  categorySheetAddSubText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  categorySheetAddMainBtn: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: H_PADDING, marginTop: 12, paddingVertical: 12 },
  categorySheetAddMainText: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.primary },
  categoryFormParentChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  categoryFormChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: GatiMitraMerchant.surfaceSubtle, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  categoryFormChipActive: { backgroundColor: GatiMitraMerchant.primaryLight, borderColor: GatiMitraMerchant.primary },
  categoryFormChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  categoryFormChipTextActive: { color: GatiMitraMerchant.navy },
  categoryFormButtons: { flexDirection: "row", gap: 12, marginTop: 20, marginBottom: 24 },
  categoryFormCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: BUTTON_RADIUS, alignItems: "center", backgroundColor: GatiMitraMerchant.surfaceSubtle, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  categoryFormSaveBtn: { flex: 1, paddingVertical: 14, borderRadius: BUTTON_RADIUS, alignItems: "center", backgroundColor: GatiMitraMerchant.primary },
  modalBtnCancelText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  modalBtnSaveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  thumbnailScroll: { paddingHorizontal: H_PADDING, marginTop: 12 },
  thumbnailWrap: { width: 64, height: 64, borderRadius: 10, overflow: "hidden", marginRight: 10, backgroundColor: GatiMitraMerchant.surfaceWarm },
  thumbnail: { width: "100%", height: "100%" },
  primaryBadge: { position: "absolute", bottom: 2, left: 2, backgroundColor: GatiMitraMerchant.primary, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  primaryBadgeText: { fontSize: 8, fontWeight: "700", color: "#fff" },

  sectionDivider: {
    height: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginVertical: 16,
  },

  section: { paddingHorizontal: H_PADDING, marginBottom: 8 },
  sectionHeading: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 6 },
  sectionSubheading: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginBottom: 12 },

  fieldWrap: { paddingHorizontal: H_PADDING, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary, marginBottom: 8 },

  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: BUTTON_RADIUS,
    paddingHorizontal: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  charCount: { fontSize: 11, color: GatiMitraMerchant.textTertiary, textAlign: "right", marginTop: 4, paddingHorizontal: H_PADDING },

  descRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: H_PADDING, marginTop: 4 },
  descWarning: { fontSize: 11, color: GatiMitraMerchant.error },

  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: BUTTON_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  dropdownValue: { fontSize: 15, color: GatiMitraMerchant.textPrimary, flex: 1 },
  dropdownPlaceholder: { fontSize: 15, color: GatiMitraMerchant.textTertiary, flex: 1 },

  valueUnitRow: { flexDirection: "row", gap: 0 },
  valueInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderTopLeftRadius: BUTTON_RADIUS,
    borderBottomLeftRadius: BUTTON_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  unitPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: GatiMitraMerchant.border,
    borderTopRightRadius: BUTTON_RADIUS,
    borderBottomRightRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  unitPickerText: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  unitFixed: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: GatiMitraMerchant.border,
    borderTopRightRadius: BUTTON_RADIUS,
    borderBottomRightRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  unitFixedText: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  helperText: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 4, paddingHorizontal: H_PADDING },

  foodTypeRow: { flexDirection: "row", gap: 12, paddingHorizontal: H_PADDING, marginBottom: 8 },
  foodChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  foodDot: { width: 14, height: 14, borderRadius: 3 },
  foodChipText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },

  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  deliveryLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },

  viewMoreBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginHorizontal: H_PADDING,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: BUTTON_RADIUS,
    marginTop: 8,
    marginBottom: 12,
  },
  viewMoreText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },

  tipsBox: { paddingHorizontal: H_PADDING, marginTop: 8 },
  tipsTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 6 },
  tipsText: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginBottom: 4, lineHeight: 18 },

  footer: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  authRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  authText: { flex: 1, fontSize: 12, color: GatiMitraMerchant.textSecondary, lineHeight: 18 },
  saveBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 16,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.surfaceSubtle,
  },
  radioLabel: { fontSize: 15, color: GatiMitraMerchant.textPrimary },

  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.surfaceSubtle,
  },
  checkLabel: { fontSize: 15, color: GatiMitraMerchant.textPrimary, flex: 1, marginRight: 12 },

  tagGroup: { marginBottom: 24 },
  tagGroupTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 12 },
  tagChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tagChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  tagChipActive: { borderColor: GatiMitraMerchant.primary, backgroundColor: GatiMitraMerchant.primaryLight + "22" },
  tagChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  tagChipTextActive: { color: GatiMitraMerchant.primary },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.surfaceSubtle,
  },
  title: { fontSize: 17, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  body: { paddingHorizontal: H_PADDING },
  confirmBtn: {
    marginHorizontal: H_PADDING,
    marginTop: 12,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingVertical: 16,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  confirmText: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  optionText: { fontSize: 15, color: GatiMitraMerchant.textPrimary },
});
