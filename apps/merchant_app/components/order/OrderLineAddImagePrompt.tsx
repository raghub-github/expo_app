import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { CatalogPhotoUploadOptionsSheet } from "@/components/menu/CatalogPhotoUploadOptionsSheet";
import {
  fetchMenuItem,
  fetchMenuImageUploadStatus,
  type MenuItemDetail,
} from "@/services/menuApi";
import { getCachedMenuItem, setCachedMenuItem } from "@/lib/menuItemCache";
import type { LineItem } from "@/hooks/useOrders";
import { CARD_RADIUS } from "@/constants/theme";

type Props = {
  item: LineItem;
  /** Only show for preparing / accepted kitchen stage. */
  enabled?: boolean;
};

/**
 * Zomato-style “Add photo” under a preparing-order line item that has
 * no menu image. Upload goes to the linked menu item (PENDING until admin
 * approves).
 */
export function OrderLineAddImagePrompt({ item, enabled = true }: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id != null ? String(selectedStore.id) : null;
  const menuItemId = item.menuItemId ?? null;

  const [menu, setMenu] = useState<MenuItemDetail | null>(null);
  /** Stable item for the sheet — avoid opening Modal with null `menu` mid-setState. */
  const [sheetItem, setSheetItem] = useState<MenuItemDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submittedReview, setSubmittedReview] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!enabled || !storeId || !token || menuItemId == null || !Number.isFinite(menuItemId)) {
      setMenu(null);
      return;
    }
    const cached = getCachedMenuItem(Number(storeId), menuItemId);
    if (cached) {
      setMenu(cached);
      return;
    }
    let cancelled = false;
    void fetchMenuItem(storeId, menuItemId, token)
      .then((detail) => {
        if (cancelled || !detail) return;
        setCachedMenuItem(Number(storeId), menuItemId, detail);
        setMenu(detail);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, storeId, token, menuItemId]);

  const liveImageUrl = menu?.item_image_url?.trim() || item.itemImageUrl?.trim() || "";
  const hasImage = Boolean(liveImageUrl) || Boolean(localPreview);
  const inReview =
    submittedReview ||
    String(menu?.primary_image_moderation_status ?? "").toUpperCase() === "PENDING";

  const showPrompt =
    enabled &&
    menuItemId != null &&
    Number.isFinite(menuItemId) &&
    (!hasImage || inReview);

  const ensureMenu = useCallback(async (): Promise<MenuItemDetail | null> => {
    if (menu) return menu;
    if (!storeId || !token || menuItemId == null) return null;
    const cached = getCachedMenuItem(Number(storeId), menuItemId);
    if (cached) {
      setMenu(cached);
      return cached;
    }
    try {
      const detail = await fetchMenuItem(storeId, menuItemId, token);
      if (detail) {
        setCachedMenuItem(Number(storeId), menuItemId, detail);
        setMenu(detail);
      }
      return detail;
    } catch {
      return null;
    }
  }, [menu, storeId, token, menuItemId]);

  const openSheet = useCallback(async () => {
    if (!storeId || !token || menuItemId == null || opening) return;
    if (inReview && hasImage && !localPreview) {
      Alert.alert(
        "Photo in review",
        "This item already has a photo waiting for admin approval."
      );
      return;
    }
    setOpening(true);
    try {
      const detail = await ensureMenu();
      if (!detail || detail.id == null || !Number.isFinite(Number(detail.id))) {
        Alert.alert(
          "Menu item unavailable",
          "Could not open this catalog item for photo upload. Try again from Menu."
        );
        return;
      }
      try {
        const status = await fetchMenuImageUploadStatus(storeId, token);
        if (status && !status.imageUploadAllowed) {
          Alert.alert(
            "Not in plan",
            "Image uploads are not included in your current plan. Upgrade to add images."
          );
          return;
        }
        setLimitReached(Boolean(status?.imageLimitReached));
        if (status?.imageLimitReached) {
          Alert.alert(
            "Limit exceeded",
            "Image upload limit reached for your plan. Upgrade to add more."
          );
          return;
        }
      } catch {
        /* allow attempt; server enforces */
      }
      setSheetItem(detail);
      setSheetOpen(true);
    } finally {
      setOpening(false);
    }
  }, [
    storeId,
    token,
    menuItemId,
    inReview,
    hasImage,
    localPreview,
    ensureMenu,
    opening,
  ]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setSheetItem(null);
  }, []);

  const uploadCallbacks = useMemo(
    () => ({
      onStart: (_id: number, previewUri: string) => {
        setLocalPreview(previewUri);
        setUploadProgress(0.05);
      },
      onProgress: (_id: number, progress: number) => {
        setUploadProgress(progress);
      },
      onSuccess: (id: number, previewUri: string, imageUrl?: string | null) => {
        setLocalPreview(previewUri);
        setUploadProgress(null);
        setSubmittedReview(true);
        if (storeId) {
          const base = sheetItem ?? menu;
          if (base) {
            const next: MenuItemDetail = {
              ...base,
              id,
              item_image_url: imageUrl ?? previewUri,
              primary_image_moderation_status: "PENDING",
              approval_status: "PENDING",
            };
            setMenu(next);
            setCachedMenuItem(Number(storeId), id, next);
          }
        }
        Alert.alert(
          "Photo submitted",
          "Your photo was uploaded and is pending admin verification before it goes live on the menu."
        );
      },
      onError: () => {
        setUploadProgress(null);
        setLocalPreview(null);
      },
    }),
    [menu, sheetItem, storeId]
  );

  if (!showPrompt) return null;

  if (inReview && hasImage) {
    return (
      <View style={styles.reviewBanner}>
        <Ionicons name="time-outline" size={14} color="#1D4ED8" />
        <Text style={styles.reviewText}>Photo in review — waiting for admin approval</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => void openSheet()}
        disabled={opening}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed, opening && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`Add photo for ${item.name}`}
      >
        <View style={styles.copyCol}>
          <Text style={styles.title}>Get upto 2x more orders</Text>
          <Text style={styles.subtitle}>
            Click a quick photo of the prepared item for your menu
          </Text>
        </View>
        <View style={styles.thumbWrap}>
          {localPreview ? (
            <Image source={{ uri: localPreview }} style={styles.thumb} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="image-outline" size={22} color="#93C5FD" />
            </View>
          )}
          {uploadProgress != null || opening ? (
            <View style={styles.progressOverlay}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          ) : (
            <View style={styles.addBtn}>
              <Ionicons name="camera" size={12} color="#FFFFFF" />
              <Text style={styles.addBtnText}>ADD</Text>
            </View>
          )}
        </View>
      </Pressable>

      {sheetItem ? (
        <CatalogPhotoUploadOptionsSheet
          visible={sheetOpen}
          item={sheetItem}
          storeId={storeId}
          token={token}
          imageLimitReached={limitReached}
          onClose={closeSheet}
          onUploaded={closeSheet}
          uploadCallbacks={uploadCallbacks}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 6,
    marginBottom: 4,
    marginLeft: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pressed: { opacity: 0.9 },
  copyCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1E3A8A",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: "#1D4ED8",
    lineHeight: 15,
  },
  thumbWrap: {
    width: 64,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: { width: "100%", height: "100%" },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#93C5FD",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    position: "absolute",
    bottom: 4,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#2563EB",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  addBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewBanner: {
    marginTop: 4,
    marginBottom: 2,
    marginLeft: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  reviewText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#1D4ED8",
  },
});
