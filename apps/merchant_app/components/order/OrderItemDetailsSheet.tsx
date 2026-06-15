import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Switch,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { OutOfStockModal, type OutOfStockPayload } from "@/components/OutOfStockModal";
import {
  fetchMenuItem,
  patchItemOutOfStock,
  type MenuItemDetail,
  type OutOfStockMode,
} from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";
import { merchantBasePriceForLineItem, formatMerchantRs } from "@/lib/merchant-line-total";
import { getCachedMenuItem, setCachedMenuItem } from "@/lib/menuItemCache";
import type { LineItem } from "@/hooks/useOrders";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  lineItem: LineItem | null;
  onClose: () => void;
};

function itemInStock(menu: MenuItemDetail | null): boolean {
  if (!menu) return true;
  if (menu.effective_in_stock != null) return menu.effective_in_stock;
  return menu.in_stock !== false;
}

function resolveMerchantItemPrice(lineItem: LineItem, menu: MenuItemDetail | null): number {
  const fromOrder = merchantBasePriceForLineItem(lineItem);
  if (fromOrder > 0) return fromOrder;
  const qty = Math.max(1, lineItem.qty || 1);
  const menuUnit = Number(menu?.base_price ?? menu?.selling_price ?? 0);
  if (menuUnit > 0) return Math.round(menuUnit * qty);
  return 0;
}

export function OrderItemDetailsSheet({ visible, lineItem, onClose }: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const [menu, setMenu] = useState<MenuItemDetail | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [oosModalOpen, setOosModalOpen] = useState(false);
  const [oosBusy, setOosBusy] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const menuItemId = lineItem?.menuItemId ?? null;

  useEffect(() => {
    if (!visible || !lineItem) {
      setMenu(null);
      setImageFailed(false);
      return;
    }
    if (!storeId || !token || menuItemId == null || !Number.isFinite(menuItemId)) {
      setMenu(null);
      return;
    }

    const cached = getCachedMenuItem(storeId, menuItemId);
    if (cached) {
      setMenu(cached);
      return;
    }

    let cancelled = false;
    void fetchMenuItem(storeId, menuItemId, token)
      .then((detail) => {
        if (cancelled || !detail) return;
        setCachedMenuItem(storeId, menuItemId, detail);
        setMenu(detail);
      })
      .catch(() => {
        if (!cancelled) setMenu(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, lineItem, storeId, token, menuItemId]);

  const displayName = menu?.item_name ?? lineItem?.name ?? "Item";
  const displayPrice = lineItem ? resolveMerchantItemPrice(lineItem, menu) : 0;
  const description =
    (menu?.item_description && menu.item_description.trim()) || null;
  const foodType = menu?.food_type ?? lineItem?.vegNonveg ?? null;
  const imageUri = useMemo(() => {
    const raw = menu?.item_image_url ?? null;
    if (!raw) return null;
    return resolveImageUrl(raw) ?? raw;
  }, [menu?.item_image_url]);

  const inStock = itemInStock(menu);
  const canManageStock = menu != null && menuItemId != null;

  const refreshMenu = useCallback(async () => {
    if (!storeId || !token || menuItemId == null) return;
    try {
      const detail = await fetchMenuItem(storeId, menuItemId, token);
      if (detail) {
        setCachedMenuItem(storeId, menuItemId, detail);
        setMenu(detail);
      }
    } catch {
      // keep previous
    }
  }, [storeId, token, menuItemId]);

  const handleConfirmOos = useCallback(
    async (payload: OutOfStockPayload) => {
      if (!storeId || !token || menuItemId == null) return;
      setOosBusy(true);
      try {
        const mode: OutOfStockMode =
          payload.mode === "HOURS"
            ? "HOURS"
            : payload.mode === "NEXT_OPEN"
              ? "NEXT_OPEN"
              : payload.mode === "CUSTOM"
                ? "CUSTOM"
                : "MANUAL";
        await patchItemOutOfStock(storeId, menuItemId, token, {
          mode,
          hours: payload.mode === "HOURS" ? payload.hours : undefined,
          until: payload.mode === "CUSTOM" ? payload.until : undefined,
        });
        await refreshMenu();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not update stock";
        Alert.alert("Could not update stock", msg);
      } finally {
        setOosBusy(false);
        setOosModalOpen(false);
      }
    },
    [storeId, token, menuItemId, refreshMenu]
  );

  const restoreInStock = useCallback(async () => {
    if (!storeId || !token || menuItemId == null) return;
    setOosBusy(true);
    try {
      await patchItemOutOfStock(storeId, menuItemId, token, { mode: "CLEAR" });
      await refreshMenu();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not restore stock";
      Alert.alert("Could not restore in stock", msg);
    } finally {
      setOosBusy(false);
      setRestoreConfirm(null);
    }
  }, [storeId, token, menuItemId, refreshMenu]);

  const handleStockToggle = useCallback(
    (nextInStock: boolean) => {
      if (!canManageStock || !menu || oosBusy) return;
      if (!nextInStock) {
        setOosModalOpen(true);
        return;
      }
      setRestoreConfirm({
        title: "Bring back in stock?",
        message: "This will make it available to customers and start receiving orders.",
        onConfirm: () => void restoreInStock(),
      });
    },
    [canManageStock, menu, oosBusy, restoreInStock]
  );

  if (!visible || !lineItem) return null;

  return (
    <>
      <MerchantBottomSheetShell
        visible={visible}
        onClose={onClose}
        maxHeightPercent="96%"
        footer={
          canManageStock ? (
            <View style={styles.stockFooter}>
              <View style={styles.stockRow}>
                <Text style={styles.stockLabel}>Item in stock</Text>
                <Switch
                  value={inStock}
                  onValueChange={handleStockToggle}
                  disabled={oosBusy}
                  trackColor={{ false: "#D1D5DB", true: "#22C55E" }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#D1D5DB"
                />
              </View>
              <Text style={styles.stockNote}>
                Note: Marking the item out of stock will not affect this or any live order. Once
                done, the item will not be available for future orders.
              </Text>
            </View>
          ) : menuItemId == null ? (
            <View style={styles.stockFooter}>
              <Text style={styles.unlinkedNote}>
                This item is not linked to your menu — stock cannot be updated here.
              </Text>
            </View>
          ) : null
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Item details</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.imageWrap}>
            {imageUri && !imageFailed ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="restaurant-outline" size={32} color={GatiMitraMerchant.textTertiary} />
                <Text style={styles.imagePlaceholderText}>
                  {imageUri ? "Image not available" : "Loading image…"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <View style={styles.titleLeft}>
                <ItemVegMark vegNonveg={foodType} name={displayName} size={16} />
                <Text style={styles.itemName} numberOfLines={3}>
                  {displayName}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{formatMerchantRs(displayPrice)}</Text>
            </View>

            <Text style={[styles.description, !description && styles.descriptionEmpty]}>
              {description || "No description added"}
            </Text>
          </View>
        </ScrollView>
      </MerchantBottomSheetShell>

      <OutOfStockModal
        visible={oosModalOpen}
        title="Mark item out of stock"
        subtitle={displayName}
        onClose={() => (oosBusy ? undefined : setOosModalOpen(false))}
        onConfirm={handleConfirmOos}
        busy={oosBusy}
      />

      <Modal
        visible={restoreConfirm != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRestoreConfirm(null)}
      >
        <View style={styles.confirmOverlay}>
          <Pressable style={styles.confirmBackdrop} onPress={() => setRestoreConfirm(null)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{restoreConfirm?.title ?? "Confirm"}</Text>
            <Text style={styles.confirmMessage}>{restoreConfirm?.message ?? ""}</Text>
            <View style={styles.confirmButtons}>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnSecondary]}
                onPress={() => setRestoreConfirm(null)}
                disabled={oosBusy}
              >
                <Text style={styles.confirmBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, styles.confirmBtnPrimary]}
                onPress={() => restoreConfirm?.onConfirm?.()}
                disabled={oosBusy}
              >
                <Text style={styles.confirmBtnPrimaryText}>Bring back in stock</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 4 },
  imageWrap: {
    width: "100%",
    minHeight: 280,
    height: 280,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { alignItems: "center", gap: 8 },
  imagePlaceholderText: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
  },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 22,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  description: {
    marginTop: 10,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 20,
  },
  descriptionEmpty: {
    color: "#F472B6",
  },
  stockFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.divider,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stockLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  stockNote: {
    marginTop: 12,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  unlinkedNote: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    padding: 20,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 20,
    marginBottom: 18,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnSecondary: {
    backgroundColor: "#F3F4F6",
  },
  confirmBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  confirmBtnPrimary: {
    backgroundColor: "#111827",
  },
  confirmBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
