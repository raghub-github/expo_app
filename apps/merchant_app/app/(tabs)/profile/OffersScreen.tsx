import { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  uploadOfferImage,
  type Offer,
  type OfferType,
  type CreateOfferPayload,
} from "@/services/offersApi";
import { fetchMenuItems, type MenuItemRow } from "@/services/menuApi";
import { getOfferLifecyclePhase } from "@/lib/offers/offer-lifecycle";
import type { OfferTrackFilter } from "@/lib/offers/offer-lifecycle";
import { campaignDateToValidFromIso, campaignDateToValidTillIso } from "@/lib/offers/offer-utils";
import {
  emptyOfferFormValues,
  populateOfferFormFromOffer,
  type OfferFormValues,
} from "@/lib/offers/offer-form";
import { OffersTrackView } from "@/components/offers/OffersTrackView";
import { OffersCreateView } from "@/components/offers/OffersCreateView";
import { OfferFormSheet } from "@/components/offers/OfferFormSheet";
import { OffersPageTabs } from "@/components/offers/OffersPageTabs";
import { offersSharedStyles } from "@/components/offers/offers-theme";

type PageTab = "create" | "track";

function buildPayloadFromForm(v: OfferFormValues): CreateOfferPayload {
  const isPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(v.offerType);
  const needsBuyGet = ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(v.offerType);
  const isCoupon = v.offerType === "COUPON";
  const couponDiscount = isCoupon && v.discountValue ? Number(v.discountValue) : null;

  return {
    offer_title: v.title.trim(),
    offer_description: v.description.trim() || null,
    offer_type: v.offerType,
    offer_sub_type: v.applyToSpecificItems ? "SPECIFIC_ITEM" : "ALL_ORDERS",
    discount_value:
      !isPct && v.discountValue
        ? Number(v.discountValue)
        : isCoupon && couponDiscount != null && couponDiscount > 100
          ? couponDiscount
          : null,
    discount_percentage:
      isPct && v.discountValue
        ? Number(v.discountValue)
        : isCoupon && couponDiscount != null && couponDiscount <= 100
          ? couponDiscount
          : null,
    max_discount_amount: v.maxDiscountAmount ? Number(v.maxDiscountAmount) : null,
    min_order_amount: v.minOrder ? Number(v.minOrder) : null,
    max_order_amount: v.maxOrder ? Number(v.maxOrder) : null,
    buy_quantity: needsBuyGet && v.buyQty ? Number(v.buyQty) : null,
    get_quantity: needsBuyGet && v.getQty ? Number(v.getQty) : null,
    coupon_code: isCoupon && v.couponCode.trim() ? v.couponCode.trim().toUpperCase() : null,
    valid_from: campaignDateToValidFromIso(v.validFrom),
    valid_till: campaignDateToValidTillIso(v.validTill),
    is_active: v.isActive,
    auto_apply: v.autoApply,
    is_stackable: v.isStackable,
    priority: v.priority ? Number(v.priority) : 0,
    max_uses_total: v.maxUsesTotal ? Number(v.maxUsesTotal) : null,
    max_uses_per_user: v.maxUsesPerUser ? Number(v.maxUsesPerUser) : null,
    first_order_only: v.firstOrderOnly,
    new_user_only: v.newUserOnly,
    menu_item_ids: v.applyToSpecificItems && v.selectedItemIds.length > 0 ? v.selectedItemIds : null,
    offer_metadata:
      v.applicableTimeStart || v.applicableTimeEnd
        ? {
            applicable_time_start: v.applicableTimeStart || null,
            applicable_time_end: v.applicableTimeEnd || null,
          }
        : undefined,
  };
}

export default function OffersScreen() {
  const router = useRouter();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name ?? null;

  const [pageTab, setPageTab] = useState<PageTab>("track");
  const [trackFilter, setTrackFilter] = useState<OfferTrackFilter>("active");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [saving, setSaving] = useState(false);
  const [formValues, setFormValues] = useState<OfferFormValues>(() => emptyOfferFormValues());
  const [imageFile, setImageFile] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!storeId || !token) return;
      if (!opts?.silent) setLoading(true);
      try {
        const list = await listOffers(storeId, token);
        setOffers(list);
      } catch {
        /* ignore */
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [storeId, token]
  );

  const loadMenuItems = useCallback(async () => {
    if (!storeId || !token) return;
    setMenuLoading(true);
    try {
      const { items } = await fetchMenuItems(String(storeId), token, {
        limit: 500,
        approvalStatus: "APPROVED",
      });
      setMenuItems(items ?? []);
    } catch {
      setMenuItems([]);
    } finally {
      setMenuLoading(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    if (showForm) loadMenuItems();
  }, [showForm, loadMenuItems]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload({ silent: true });
    setRefreshing(false);
  }, [reload]);

  useEffect(() => {
    reload();
  }, [reload]);

  const offersByItemId = useMemo(() => {
    const map = new Map<string, { total: number; active: number }>();
    const now = new Date();
    offers.forEach((o) => {
      if (!o.menu_item_ids?.length) return;
      const isActive = getOfferLifecyclePhase(o, now) === "active";
      o.menu_item_ids.forEach((id) => {
        const prev = map.get(id) ?? { total: 0, active: 0 };
        prev.total += 1;
        if (isActive) prev.active += 1;
        map.set(id, prev);
      });
    });
    return map;
  }, [offers]);

  const patchForm = useCallback((patch: Partial<OfferFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetForm = () => {
    setFormValues(emptyOfferFormValues());
    setImageFile(null);
    setUploadingImage(false);
    setMenuSearch("");
  };

  const openCreate = (presetType?: OfferType) => {
    resetForm();
    setFormValues(emptyOfferFormValues(presetType));
    setEditing(null);
    setShowForm(true);
  };

  const isItemEligibleForFlat = useCallback(
    (item: MenuItemRow): boolean => {
      if (formValues.offerType !== "FLAT") return true;
      if (editing?.menu_item_ids?.includes(item.item_id)) return true;
      const stats = offersByItemId.get(item.item_id);
      return !(stats && stats.total > 0);
    },
    [formValues.offerType, editing, offersByItemId]
  );

  const openEdit = (o: Offer) => {
    setEditing(o);
    setFormValues(populateOfferFormFromOffer(o));
    setImageFile(null);
    setMenuSearch("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    resetForm();
  };

  const toggleMenuItem = (itemId: string) => {
    setFormValues((prev) => {
      const has = prev.selectedItemIds.includes(itemId);
      return {
        ...prev,
        selectedItemIds: has
          ? prev.selectedItemIds.filter((id) => id !== itemId)
          : [...prev.selectedItemIds, itemId],
      };
    });
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
      setImageFile({
        uri: asset.uri,
        type: (asset as { mimeType?: string }).mimeType ?? "image/jpeg",
        name: (asset as { fileName?: string }).fileName ?? "offer.jpg",
      });
      patchForm({ imagePreview: asset.uri });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not pick image.");
    }
  }, [storeId, token, patchForm]);

  const handleSave = async () => {
    if (!storeId || !token) return;
    const v = formValues;

    if (v.applyToSpecificItems && v.selectedItemIds.length === 0) {
      Alert.alert("Required", "Select at least one menu item for this offer.");
      return;
    }

    if (v.offerType === "FLAT" && v.applyToSpecificItems) {
      const invalid = menuItems.filter(
        (m) => v.selectedItemIds.includes(m.item_id) && !isItemEligibleForFlat(m)
      );
      if (invalid.length > 0) {
        Alert.alert("Not allowed", "Some selected items are already mapped to another offer.");
        return;
      }
    }

    const payload = buildPayloadFromForm(v);

    setSaving(true);
    try {
      if (editing) {
        await updateOffer(storeId, editing.offer_id, payload, token);
        if (imageFile) {
          setUploadingImage(true);
          const uploaded = await uploadOfferImage(storeId, editing.offer_id, token, imageFile);
          await updateOffer(
            storeId,
            editing.offer_id,
            { offer_image_url: uploaded.image_url } as Partial<CreateOfferPayload>,
            token
          );
        }
        Alert.alert("Updated", "Offer updated successfully.");
      } else {
        const created = await createOffer(storeId, payload, token);
        if (imageFile && created?.offer_id) {
          setUploadingImage(true);
          const uploaded = await uploadOfferImage(storeId, created.offer_id, token, imageFile);
          await updateOffer(
            storeId,
            created.offer_id,
            { offer_image_url: uploaded.image_url } as Partial<CreateOfferPayload>,
            token
          );
        }
        Alert.alert("Created", "Offer created successfully.");
      }
      closeForm();
      await reload();
      setPageTab("track");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save offer.");
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const handleDelete = (o: Offer) => {
    Alert.alert("Deactivate offer?", `"${o.offer_title}" will be deactivated.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Deactivate",
        style: "destructive",
        onPress: async () => {
          if (!storeId || !token) return;
          try {
            await deleteOffer(storeId, o.offer_id, token);
            await reload();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed");
          }
        },
      },
    ]);
  };

  const handleToggle = async (o: Offer) => {
    if (!storeId || !token) return;
    try {
      await updateOffer(storeId, o.offer_id, { is_active: !o.is_active }, token);
      await reload();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
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
    <View style={offersSharedStyles.screen}>
      <OffersPageTabs active={pageTab} trackCount={offers.length} onChange={setPageTab} />

      {pageTab === "create" ? (
        <OffersCreateView
          offers={offers}
          storeName={storeName}
          onCreate={openCreate}
          onGoToTrack={() => setPageTab("track")}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      ) : (
        <OffersTrackView
          offers={offers}
          loading={loading}
          refreshing={refreshing}
          storeName={storeName}
          trackFilter={trackFilter}
          onTrackFilterChange={setTrackFilter}
          onRefresh={onRefresh}
          onCreatePress={() => openCreate()}
          onOpenInsights={() => router.push("/(tabs)/profile/offer-insights")}
          onEdit={openEdit}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      )}

      {loading && pageTab === "create" && offers.length === 0 ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        </View>
      ) : null}

      <OfferFormSheet
        visible={showForm}
        editing={!!editing}
        saving={saving}
        uploadingImage={uploadingImage}
        values={formValues}
        onChange={patchForm}
        menuItems={menuItems}
        menuLoading={menuLoading}
        menuSearch={menuSearch}
        onMenuSearchChange={setMenuSearch}
        onToggleMenuItem={toggleMenuItem}
        isMenuItemDisabled={(item) => !isItemEligibleForFlat(item)}
        onPickImage={openImagePicker}
        onSave={handleSave}
        onClose={closeForm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textTertiary, marginTop: 10 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
