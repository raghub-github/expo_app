import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Image,
  TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  listOffers, createOffer, updateOffer, deleteOffer, uploadOfferImage,
  type Offer, type OfferType, type CreateOfferPayload,
} from "@/services/offersApi";
import { fetchMenuItems, type MenuItemRow } from "@/services/menuApi";

const OFFER_TYPES: { value: OfferType; label: string; icon: string }[] = [
  { value: "PERCENTAGE",      label: "% Off Items",     icon: "trending-down-outline" },
  { value: "FLAT",            label: "Flat ₹ Off",      icon: "cash-outline" },
  { value: "CART_PERCENTAGE", label: "% Off Cart",      icon: "cart-outline" },
  { value: "CART_FLAT",       label: "Flat ₹ Cart",     icon: "wallet-outline" },
  { value: "BUY_X_GET_Y",    label: "Buy X Get Y",     icon: "gift-outline" },
  { value: "BUY_N_GET_M",    label: "Buy N Get M",     icon: "gift-outline" },
  { value: "BOGO",            label: "Buy 1 Get 1",     icon: "copy-outline" },
  { value: "COUPON",          label: "Coupon Code",     icon: "ticket-outline" },
  { value: "FREE_DELIVERY",   label: "Free Delivery",   icon: "bicycle-outline" },
  { value: "FREE_ITEM",       label: "Free Item",       icon: "fast-food-outline" },
  { value: "TIERED",          label: "Tiered Discount", icon: "podium-outline" },
  { value: "BUNDLE",          label: "Bundle Deal",     icon: "layers-outline" },
];

function formatDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function OfferStatusBadge({ offer }: { offer: Offer }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const vf = new Date(offer.valid_from);
  const vt = new Date(offer.valid_till);
  const from = new Date(vf.getFullYear(), vf.getMonth(), vf.getDate());
  const till = new Date(vt.getFullYear(), vt.getMonth(), vt.getDate());
  const active = offer.is_active && today >= from && today <= till;
  const expired = till < today;
  const scheduled = from > today;
  const color = active ? "#16a34a" : expired ? "#dc2626" : scheduled ? "#f59e0b" : "#9ca3af";
  const label = active ? "Active" : expired ? "Expired" : scheduled ? "Scheduled" : "Inactive";
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export default function OffersScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [offerType, setOfferType] = useState<OfferType>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [getQty, setGetQty] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTill, setValidTill] = useState("");
  const [autoApply, setAutoApply] = useState(true);
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [maxUsesTotal, setMaxUsesTotal] = useState("");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState("");
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [newUserOnly, setNewUserOnly] = useState(false);
  const [imageFile, setImageFile] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [applyToSpecificItems, setApplyToSpecificItems] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    if (!storeId || !token) return;
    setLoading(true);
    try {
      const list = await listOffers(storeId, token);
      setOffers(list);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [storeId, token]);

  useEffect(() => { reload(); }, [reload]);

  const offersByItemId = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    const now = new Date();
    offers.forEach((o) => {
      if (!o.menu_item_ids || !o.menu_item_ids.length) return;
      const vf = new Date(o.valid_from);
      const vt = new Date(o.valid_till);
      const from = new Date(vf.getFullYear(), vf.getMonth(), vf.getDate());
      const till = new Date(vt.getFullYear(), vt.getMonth(), vt.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const isWithin = today >= from && today <= till;
      const isActive = !!(o.is_active && isWithin);
      o.menu_item_ids.forEach((id) => {
        const prev = map.get(id) ?? { total: 0, active: 0 };
        prev.total += 1;
        if (isActive) prev.active += 1;
        map.set(id, prev);
      });
    });
    return map;
  }, [offers]);

  const loadMenuForSelection = useCallback(async () => {
    if (!storeId || !token) return;
    setMenuLoading(true);
    try {
      const res = await fetchMenuItems(storeId, token, { limit: 500, offset: 0 });
      setMenuItems(res.items ?? []);
    } catch {
      // ignore
    } finally {
      setMenuLoading(false);
    }
  }, [storeId, token]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setOfferType("PERCENTAGE"); setDiscountValue("");
    setMinOrder(""); setCouponCode(""); setBuyQty(""); setGetQty("");
    setValidFrom(""); setValidTill(""); setAutoApply(true);
    setMaxDiscountAmount(""); setMaxUsesTotal(""); setMaxUsesPerUser("");
    setFirstOrderOnly(false); setNewUserOnly(false);
    setImageFile(null); setImagePreview(null); setUploadingImage(false);
    setApplyToSpecificItems(false);
    setSelectedItemIds([]);
    setMenuSearch("");
  };

  const openCreate = () => { resetForm(); setEditing(null); setShowForm(true); };

  const getItemPrice = (item: MenuItemRow): number => {
    const raw = item.selling_price ?? item.base_price;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const isItemEligibleForFlat = (item: MenuItemRow): boolean => {
    if (offerType !== "FLAT") return true;
    // For flat offers, only freeze items that are already mapped to any offer.
    const stats = offersByItemId.get(item.item_id);
    if (stats && stats.total > 0) return false;
    return true;
  };

  const filteredMenuItems = useMemo(() => {
    const term = menuSearch.trim().toLowerCase();
    return menuItems.filter((m) => {
      if (term && !m.item_name.toLowerCase().includes(term) && !m.item_id.toLowerCase().includes(term)) {
        return false;
      }
      return isItemEligibleForFlat(m);
    });
  }, [menuItems, menuSearch, offerType, discountValue, offersByItemId]);

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const openEdit = (o: Offer) => {
    setEditing(o);
    setTitle(o.offer_title);
    setDescription(o.offer_description ?? "");
    setOfferType(o.offer_type);
    const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(o.offer_type);
    setDiscountValue(String((isPct ? o.discount_percentage : o.discount_value) ?? ""));
    setMinOrder(o.min_order_amount != null ? String(o.min_order_amount) : "");
    setCouponCode(o.coupon_code ?? "");
    setBuyQty(o.buy_quantity != null ? String(o.buy_quantity) : "");
    setGetQty(o.get_quantity != null ? String(o.get_quantity) : "");
    setValidFrom(o.valid_from ? new Date(o.valid_from).toISOString().slice(0, 10) : "");
    setValidTill(o.valid_till ? new Date(o.valid_till).toISOString().slice(0, 10) : "");
    setAutoApply(o.auto_apply ?? true);
    setMaxDiscountAmount(o.max_discount_amount != null ? String(o.max_discount_amount) : "");
    setMaxUsesTotal(o.max_uses_total != null ? String(o.max_uses_total) : "");
    setMaxUsesPerUser(o.max_uses_per_user != null ? String(o.max_uses_per_user) : "");
    setFirstOrderOnly(o.first_order_only ?? false);
    setNewUserOnly(o.new_user_only ?? false);
    setImagePreview(o.offer_image_url ?? null);
    setImageFile(null);
    const hasItems = Array.isArray(o.menu_item_ids) && o.menu_item_ids.length > 0;
    setApplyToSpecificItems(hasItems);
    setSelectedItemIds(hasItems ? (o.menu_item_ids as string[]) : []);
    if (hasItems) loadMenuForSelection();
    setShowForm(true);
  };

  const openImagePicker = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if (perm?.status !== "granted" && perm?.status !== "undetermined") {
        Alert.alert("Permission needed", "Allow access to photos to upload an offer image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: (ImagePicker as any).MediaTypeOptions?.Images ?? "images",
        allowsEditing: true,
        aspect: [2, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const fileInfo = {
        uri: asset.uri,
        type: (asset as any).mimeType ?? "image/jpeg",
        name: (asset as any).fileName ?? "offer.jpg",
      };
      setImageFile(fileInfo);
      setImagePreview(asset.uri);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not pick image.");
    }
  }, [storeId, token]);

  const handleSave = async () => {
    if (!storeId || !token) return;
    if (!title.trim()) { Alert.alert("Required", "Offer title is required."); return; }
    if (!validFrom || !validTill) { Alert.alert("Required", "Valid from and valid till dates are required."); return; }

    const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(offerType);
    const needsBuyGet = ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(offerType);

    if (applyToSpecificItems && selectedItemIds.length === 0) {
      Alert.alert("Required", "Select at least one menu item for this offer.");
      return;
    }

    if (offerType === "FLAT" && applyToSpecificItems) {
      const invalid = menuItems.filter(
        (m) => selectedItemIds.includes(m.item_id) && !isItemEligibleForFlat(m)
      );
      if (invalid.length > 0) {
        Alert.alert("Not allowed", "Some selected items are already mapped to another offer.");
        return;
      }
    }

    const payload: CreateOfferPayload = {
      offer_title: title.trim(),
      offer_description: description.trim() || null,
      offer_type: offerType,
      offer_sub_type: applyToSpecificItems ? "SPECIFIC_ITEM" : "ALL_ORDERS",
      discount_value: !isPct && discountValue ? Number(discountValue) : null,
      discount_percentage: isPct && discountValue ? Number(discountValue) : null,
      max_discount_amount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
      min_order_amount: minOrder ? Number(minOrder) : null,
      buy_quantity: needsBuyGet && buyQty ? Number(buyQty) : null,
      get_quantity: needsBuyGet && getQty ? Number(getQty) : null,
      coupon_code: offerType === "COUPON" && couponCode.trim() ? couponCode.trim().toUpperCase() : null,
      valid_from: new Date(validFrom).toISOString(),
      valid_till: new Date(validTill).toISOString(),
      is_active: true,
      auto_apply: autoApply,
      max_uses_total: maxUsesTotal ? Number(maxUsesTotal) : null,
      max_uses_per_user: maxUsesPerUser ? Number(maxUsesPerUser) : null,
      first_order_only: firstOrderOnly,
      new_user_only: newUserOnly,
      menu_item_ids: applyToSpecificItems && selectedItemIds.length > 0 ? selectedItemIds : null,
    };

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateOffer(storeId, editing.offer_id, payload, token);
        if (imageFile) {
          setUploadingImage(true);
          const uploaded = await uploadOfferImage(storeId, editing.offer_id, token, imageFile);
          await updateOffer(storeId, editing.offer_id, { offer_image_url: uploaded.image_url } as any, token);
        }
        Alert.alert("Updated", "Offer updated successfully.");
      } else {
        const created = await createOffer(storeId, payload, token);
        if (imageFile && (created as any)?.offer_id) {
          setUploadingImage(true);
          const uploaded = await uploadOfferImage(storeId, (created as any).offer_id, token, imageFile);
          await updateOffer(storeId, (created as any).offer_id, { offer_image_url: uploaded.image_url } as any, token);
        }
        Alert.alert("Created", "Offer created successfully.");
      }
      resetForm(); setShowForm(false); setEditing(null); await reload();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save offer.");
    } finally { setSaving(false); setUploadingImage(false); }
  };

  const handleDelete = (o: Offer) => {
    Alert.alert("Deactivate offer?", `"${o.offer_title}" will be deactivated.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deactivate", style: "destructive",
        onPress: async () => {
          if (!storeId || !token) return;
          try { await deleteOffer(storeId, o.offer_id, token); await reload(); }
          catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
        },
      },
    ]);
  };

  const handleToggle = async (o: Offer) => {
    if (!storeId || !token) return;
    try {
      await updateOffer(storeId, o.offer_id, { is_active: !o.is_active }, token);
      await reload();
    } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
  };

  if (!storeId || !token) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.emptyText}>Sign in and select a store.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Offers & Promotions</Text>
          <Text style={styles.subtitle}>Create and manage discounts, coupons, and promotions.</Text>
        </View>

        {!showForm && (
          <Pressable onPress={openCreate} style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.createBtnText}>Create New Offer</Text>
          </Pressable>
        )}

        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{editing ? "Edit Offer" : "New Offer"}</Text>

            <Text style={styles.label}>Offer type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {OFFER_TYPES.map((t) => (
                <Pressable key={t.value} onPress={() => setOfferType(t.value)}
                  style={[styles.typeChip, offerType === t.value && styles.typeChipActive]}>
                  <Ionicons name={t.icon as any} size={16} color={offerType === t.value ? "#fff" : GatiMitraMerchant.textSecondary} />
                  <Text style={[styles.typeChipText, offerType === t.value && styles.typeChipTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>Offer title *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. 20% off on all items" placeholderTextColor={GatiMitraMerchant.textTertiary} />

            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, { minHeight: 60 }]} value={description} onChangeText={setDescription} placeholder="Optional description" placeholderTextColor={GatiMitraMerchant.textTertiary} multiline />

            <Text style={styles.label}>Offer image (optional)</Text>
            <View style={styles.imageRow}>
              <Pressable onPress={openImagePicker} style={({ pressed }) => [styles.imageBtn, pressed && styles.imageBtnPressed]}>
                <Ionicons name="image-outline" size={18} color="#fff" />
                <Text style={styles.imageBtnText}>{imagePreview ? "Change image" : "Choose image"}</Text>
              </Pressable>
              {imagePreview ? (
                <View style={styles.imagePreviewWrap}>
                  <Image source={{ uri: imagePreview }} style={styles.imagePreview} />
                </View>
              ) : null}
            </View>
            {uploadingImage ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
                <Text style={{ marginLeft: 8, color: GatiMitraMerchant.textSecondary, fontSize: 12 }}>
                  Uploading image...
                </Text>
              </View>
            ) : null}

            {["PERCENTAGE", "CART_PERCENTAGE"].includes(offerType) && (
              <>
                <Text style={styles.label}>Discount % *</Text>
                <TextInput style={styles.input} value={discountValue} onChangeText={setDiscountValue} placeholder="e.g. 20" keyboardType="numeric" placeholderTextColor={GatiMitraMerchant.textTertiary} />
                <Text style={styles.label}>Max discount cap ₹ (optional)</Text>
                <TextInput style={styles.input} value={maxDiscountAmount} onChangeText={setMaxDiscountAmount} placeholder="e.g. 100" keyboardType="numeric" placeholderTextColor={GatiMitraMerchant.textTertiary} />
              </>
            )}

            {["FLAT", "CART_FLAT"].includes(offerType) && (
              <>
                <Text style={styles.label}>Flat discount ₹ *</Text>
                <TextInput style={styles.input} value={discountValue} onChangeText={setDiscountValue} placeholder="e.g. 50" keyboardType="numeric" placeholderTextColor={GatiMitraMerchant.textTertiary} />
              </>
            )}

            {["BUY_N_GET_M", "BUY_X_GET_Y", "BOGO"].includes(offerType) && (
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Buy qty</Text>
                  <TextInput style={styles.input} value={buyQty} onChangeText={setBuyQty} keyboardType="numeric" placeholder={offerType === "BOGO" ? "1" : "2"} placeholderTextColor={GatiMitraMerchant.textTertiary} />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Get free qty</Text>
                  <TextInput style={styles.input} value={getQty} onChangeText={setGetQty} keyboardType="numeric" placeholder="1" placeholderTextColor={GatiMitraMerchant.textTertiary} />
                </View>
              </View>
            )}

            {offerType === "COUPON" && (
              <>
                <Text style={styles.label}>Coupon code *</Text>
                <TextInput style={styles.input} value={couponCode} onChangeText={(t) => setCouponCode(t.toUpperCase())} placeholder="e.g. SAVE20" autoCapitalize="characters" placeholderTextColor={GatiMitraMerchant.textTertiary} />
                <Text style={styles.label}>Discount % (or leave blank for flat)</Text>
                <TextInput style={styles.input} value={discountValue} onChangeText={setDiscountValue} keyboardType="numeric" placeholder="e.g. 15 for 15%" placeholderTextColor={GatiMitraMerchant.textTertiary} />
              </>
            )}

            {offerType === "TIERED" && (
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color="#4b5563" />
                <Text style={styles.infoText}>
                  Tiered discounts require tier configuration. Set tiers via the web dashboard or partner portal.
                </Text>
              </View>
            )}

            <Text style={styles.label}>Min order amount ₹</Text>
            <TextInput style={styles.input} value={minOrder} onChangeText={setMinOrder} keyboardType="numeric" placeholder="Optional" placeholderTextColor={GatiMitraMerchant.textTertiary} />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Total uses limit</Text>
                <TextInput style={styles.input} value={maxUsesTotal} onChangeText={setMaxUsesTotal} keyboardType="numeric" placeholder="Unlimited" placeholderTextColor={GatiMitraMerchant.textTertiary} />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Per user limit</Text>
                <TextInput style={styles.input} value={maxUsesPerUser} onChangeText={setMaxUsesPerUser} keyboardType="numeric" placeholder="Unlimited" placeholderTextColor={GatiMitraMerchant.textTertiary} />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Valid from *</Text>
                <TextInput style={styles.input} value={validFrom} onChangeText={setValidFrom} placeholder="YYYY-MM-DD" placeholderTextColor={GatiMitraMerchant.textTertiary} />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Valid till *</Text>
                <TextInput style={styles.input} value={validTill} onChangeText={setValidTill} placeholder="YYYY-MM-DD" placeholderTextColor={GatiMitraMerchant.textTertiary} />
              </View>
            </View>

            <Pressable onPress={() => setAutoApply(!autoApply)} style={styles.toggleRow}>
              <Ionicons name={autoApply ? "checkbox" : "square-outline"} size={20} color={GatiMitraMerchant.primary} />
              <Text style={styles.toggleLabel}>Auto-apply (no coupon needed)</Text>
            </Pressable>

            <Pressable onPress={() => setFirstOrderOnly(!firstOrderOnly)} style={styles.toggleRow}>
              <Ionicons name={firstOrderOnly ? "checkbox" : "square-outline"} size={20} color={GatiMitraMerchant.primary} />
              <Text style={styles.toggleLabel}>First order only</Text>
            </Pressable>

            <Pressable onPress={() => setNewUserOnly(!newUserOnly)} style={styles.toggleRow}>
              <Ionicons name={newUserOnly ? "checkbox" : "square-outline"} size={20} color={GatiMitraMerchant.primary} />
              <Text style={styles.toggleLabel}>New users only</Text>
            </Pressable>

            <View style={styles.formActions}>
              <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [styles.saveBtn, saving && styles.saveBtnDisabled, pressed && !saving && styles.saveBtnPressed]}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>{editing ? "Update Offer" : "Create Offer"}</Text>}
              </Pressable>
              <Pressable onPress={() => { resetForm(); setShowForm(false); setEditing(null); }} style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {loading && offers.length === 0 ? (
          <View style={styles.centered}><ActivityIndicator size="large" color={GatiMitraMerchant.primary} /></View>
        ) : offers.length === 0 && !showForm ? (
          <View style={styles.emptyCard}>
            <Ionicons name="pricetag-outline" size={40} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>No offers yet. Create one to attract customers!</Text>
          </View>
        ) : (
          <View style={styles.offerList}>
            {offers.map((o) => (
              <View key={o.id} style={[styles.offerCard, !o.is_active && styles.offerCardInactive]}>
                <View style={styles.offerHeader}>
                  <View style={styles.offerTitleRow}>
                    <Text style={styles.offerTitle} numberOfLines={2}>{o.offer_title}</Text>
                    <OfferStatusBadge offer={o} />
                  </View>
                  <View style={styles.offerTypeBadge}>
                    <Text style={styles.offerTypeText}>{o.offer_type.replace(/_/g, " ")}</Text>
                  </View>
                </View>

                <View style={styles.offerDetails}>
                  {(o.discount_value || o.discount_percentage) && (
                    <View style={styles.detailRow}>
                      <Ionicons name="pricetag-outline" size={14} color={GatiMitraMerchant.primary} />
                      <Text style={styles.detailText}>
                        {o.offer_type === "PERCENTAGE"
                          ? `${o.discount_percentage ?? o.discount_value}% off`
                          : `₹${o.discount_value ?? o.discount_percentage} off`}
                      </Text>
                    </View>
                  )}
                  {o.min_order_amount && Number(o.min_order_amount) > 0 && (
                    <View style={styles.detailRow}>
                      <Ionicons name="cart-outline" size={14} color={GatiMitraMerchant.textSecondary} />
                      <Text style={styles.detailText}>Min order: ₹{Number(o.min_order_amount).toFixed(0)}</Text>
                    </View>
                  )}
                  {o.coupon_code && (
                    <View style={styles.detailRow}>
                      <Ionicons name="ticket-outline" size={14} color="#8b5cf6" />
                      <Text style={[styles.detailText, { color: "#8b5cf6", fontWeight: "700" }]}>{o.coupon_code}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={14} color={GatiMitraMerchant.textSecondary} />
                    <Text style={styles.detailText}>{formatDate(o.valid_from)} – {formatDate(o.valid_till)}</Text>
                  </View>
                  {o.current_uses > 0 && (
                    <View style={styles.detailRow}>
                      <Ionicons name="people-outline" size={14} color={GatiMitraMerchant.textSecondary} />
                      <Text style={styles.detailText}>{o.current_uses} uses</Text>
                    </View>
                  )}
                </View>

                <View style={styles.offerActions}>
                  <Pressable onPress={() => handleToggle(o)} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}>
                    <Ionicons name={o.is_active ? "pause-circle-outline" : "play-circle-outline"} size={16} color={o.is_active ? "#f59e0b" : "#16a34a"} />
                    <Text style={[styles.actionText, { color: o.is_active ? "#f59e0b" : "#16a34a" }]}>{o.is_active ? "Pause" : "Activate"}</Text>
                  </Pressable>
                  <Pressable onPress={() => openEdit(o)} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}>
                    <Ionicons name="create-outline" size={16} color={GatiMitraMerchant.primary} />
                    <Text style={[styles.actionText, { color: GatiMitraMerchant.primary }]}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(o)} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}>
                    <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    <Text style={[styles.actionText, { color: "#dc2626" }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  scroll: { flex: 1 },
  content: { padding: H_PADDING, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  subtitle: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, backgroundColor: GatiMitraMerchant.primary, borderRadius: 14, marginBottom: 16, ...GatiMitraMerchant.shadowSm },
  createBtnPressed: { opacity: 0.85 },
  createBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  formCard: { backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, padding: 16, borderWidth: 1.5, borderColor: GatiMitraMerchant.primary, marginBottom: 16, ...GatiMitraMerchant.shadowSm },
  formTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: GatiMitraMerchant.textPrimary, backgroundColor: "#fff" },
  imageRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  imageBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: GatiMitraMerchant.primary },
  imageBtnPressed: { opacity: 0.85 },
  imageBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  imagePreviewWrap: { width: 56, height: 56, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  imagePreview: { width: "100%", height: "100%" },
  row: { flexDirection: "row", gap: 10 },
  halfField: { flex: 1 },
  typeScroll: { marginBottom: 6 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: "#f3f4f6", marginRight: 8, borderWidth: 1, borderColor: "#e5e7eb" },
  typeChipActive: { backgroundColor: GatiMitraMerchant.primary, borderColor: GatiMitraMerchant.primary },
  typeChipText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  typeChipTextActive: { color: "#fff" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  toggleLabel: { fontSize: 13, color: GatiMitraMerchant.textPrimary },
  formActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  saveBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 99, backgroundColor: GatiMitraMerchant.primary },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnPressed: { opacity: 0.85 },
  saveBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 99, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  cancelBtnPressed: { opacity: 0.7 },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  emptyCard: { alignItems: "center", padding: 40, backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textTertiary, textAlign: "center", marginTop: 10 },
  offerList: { gap: 12 },
  offerCard: { backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, padding: 14, borderWidth: 1, borderColor: GatiMitraMerchant.border, ...GatiMitraMerchant.shadowSm },
  offerCardInactive: { opacity: 0.6 },
  offerHeader: { marginBottom: 10 },
  offerTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  offerTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  offerTypeBadge: { marginTop: 4, alignSelf: "flex-start", backgroundColor: "#ede9fe", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  offerTypeText: { fontSize: 10, fontWeight: "700", color: "#7c3aed", textTransform: "uppercase" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff", textTransform: "uppercase" },
  offerDetails: { gap: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  offerActions: { flexDirection: "row", justifyContent: "flex-end", gap: 6, paddingTop: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fafafa" },
  actionPressed: { opacity: 0.7 },
  actionText: { fontSize: 11, fontWeight: "600" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#f3f4f6", borderRadius: 10, padding: 10, marginTop: 8 },
  infoText: { flex: 1, fontSize: 12, color: "#4b5563", lineHeight: 18 },
});
