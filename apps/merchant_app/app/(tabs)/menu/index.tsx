/**
 * Catalog — categories and items from merchant-menu API.
 * Data layer: useMenuQueries (backend is source of truth; cache + invalidation here).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Image,
  InteractionManager,
  Modal,
  Alert,
  Pressable,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING,
  CARD_RADIUS,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useMenuCategories, useMenuItems, usePatchItemStock, menuKeys, MENU_CATALOG_LIST_FILTERS } from "@/hooks/useMenuQueries";
import type { MenuItemRow, MenuCategory, MenuItemDetail, ListItemsResponse } from "@/services/menuApi";
import type { ComboRow, ComboDetail } from "@/services/menuApi";
import {
  deleteMenuItem,
  createDeleteRequest,
  deleteCombo,
  fetchCombos,
  fetchCombo,
  updateCombo,
  fetchMenuItem,
  fetchMenuItems,
  fetchMenuImageUploadStatus,
  type MenuImageUploadStatus,
  patchComboOutOfStock,
  patchItemOutOfStock,
  patchCategoryOutOfStock,
  patchItemFlags,
  type OutOfStockMode as ApiOutOfStockMode,
} from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { OutOfStockModal, type OutOfStockPayload } from "@/components/OutOfStockModal";
import {
  CatalogCustItemsPanel,
  itemHasCustomizationContent,
} from "@/components/menu/CatalogCustItemsPanel";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import { CatalogItemEditSheet } from "@/components/menu/CatalogItemEditSheet";
import { CatalogItemPhotoSheet } from "@/components/menu/CatalogItemPhotoSheet";
import { CatalogPhotoUploadOptionsSheet } from "@/components/menu/CatalogPhotoUploadOptionsSheet";
import { CatalogPhotoUploadToast } from "@/components/menu/CatalogPhotoUploadToast";
import { CatalogPhotoUploadingOverlay } from "@/components/menu/CatalogPhotoUploadingOverlay";
import type { CatalogPhotoUploadCallbacks } from "@/lib/catalogPhotoUploadFlow";
import { CatalogStockToggle } from "@/components/menu/CatalogStockToggle";
import { CatalogCategoryMenuSheet } from "@/components/menu/CatalogCategoryMenuSheet";
import { AuthProxyImage, prefetchAuthImage, prefetchAuthImages } from "@/components/AuthProxyImage";
import { prefetchMenuItemDetail, invalidateMenuItemCache } from "@/lib/menuItemCache";

type ApprovalFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type StockFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK";
type ChangeRequestFilter = "ALL" | "DELETE" | "UPDATE";
type ItemKindFilter = "ALL" | "ITEMS" | "COMBOS" | "ADDONS";

type MenuViewMode = "card" | "tree";
/** Bumped so existing installs pick list (tree) as the new default once. */
const MENU_VIEW_MODE_KEY = "gatimitra_merchant_menu_view_mode_v2";
const CATALOG_TOGGLE_RADIUS = 15;

type CatalogKindTab = "ALL" | "COMBOS" | "ADDONS";

function CatalogKindToggle({
  active,
  allCount,
  comboCount,
  addonsCount,
  onChange,
}: {
  active: CatalogKindTab;
  allCount: number;
  comboCount: number;
  addonsCount: number;
  onChange: (tab: CatalogKindTab) => void;
}) {
  const pills: { key: CatalogKindTab; label: string; count: number }[] = [
    { key: "ALL", label: "All items", count: allCount },
    { key: "COMBOS", label: "Combo", count: comboCount },
    { key: "ADDONS", label: "Add-ons", count: addonsCount },
  ];

  return (
    <View style={styles.catalogKindToggleRow}>
      {pills.map((pill) => {
        const isActive = active === pill.key;
        return (
          <Pressable
            key={pill.key}
            onPress={() => onChange(pill.key)}
            style={({ pressed }) => [
              styles.catalogKindPill,
              isActive && styles.catalogKindPillActive,
              pressed && styles.catalogKindPillPressed,
            ]}
          >
            <Text style={[styles.catalogKindLabel, isActive && styles.catalogKindLabelActive]}>
              {pill.label}
            </Text>
            <View style={[styles.catalogKindBadge, isActive && styles.catalogKindBadgeActive]}>
              <Text style={[styles.catalogKindBadgeText, isActive && styles.catalogKindBadgeTextActive]}>
                {pill.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const FOOD_TYPE_LABELS: Record<string, string> = {
  VEG: "Veg",
  NON_VEG: "Non-Veg",
  EGG: "Egg",
  VEGAN: "Vegan",
};

function parseOosUntilDate(untilValue: unknown): Date | null {
  if (untilValue == null) return null;
  if (untilValue instanceof Date) return Number.isFinite(untilValue.getTime()) ? untilValue : null;
  if (typeof untilValue === "number") {
    const d = new Date(untilValue);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof untilValue === "object") {
    try {
      const iso = (untilValue as { toISOString?: () => string })?.toISOString?.();
      if (iso) {
        const d = new Date(iso);
        if (Number.isFinite(d.getTime())) return d;
      }
    } catch {
      // ignore
    }
  }
  const raw = String(untilValue ?? "").trim();
  if (!raw) return null;

  const candidates = new Set<string>([raw]);
  const spaced = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
  candidates.add(spaced);

  // Postgres / pgbouncer: "2026-05-26 12:54:00+00" — Hermes rejects "+00" without ":00".
  for (const base of [raw, spaced]) {
    const withMinutes = base.match(/^(.+)([+\-]\d{2})(\d{2})$/);
    if (withMinutes) candidates.add(`${withMinutes[1]}${withMinutes[2]}:${withMinutes[3]}`);
    const shortTz = base.match(/^(.+)([+\-]\d{2})$/);
    if (shortTz) {
      candidates.add(`${shortTz[1]}${shortTz[2]}:00`);
      if (shortTz[2] === "+00" || shortTz[2] === "-00") {
        candidates.add(`${shortTz[1].replace(/[+\-]\d{2}$/, "")}Z`);
      }
    }
  }

  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/.test(raw) && !/[zZ]|[+\-][0-9]{2}(:[0-9]{2})?$/.test(raw)) {
    candidates.add(`${raw}Z`);
  }

  const d = [...candidates]
    .map((s) => new Date(s))
    .find((x) => Number.isFinite(x.getTime()));
  return d ?? null;
}

function formatOosUntilLabel(untilValue: unknown) {
  const d = parseOosUntilDate(untilValue);
  if (!d) return null;

  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `Out of stock till ${time}, ${date}`;
}

function isOosActiveAt(manual?: boolean | null, until?: unknown, nowMs = Date.now()): boolean {
  if (manual) return true;
  const d = parseOosUntilDate(until);
  if (!d) return false;
  return d.getTime() > nowMs;
}

function categoryOosUntilLabel(untilValue: unknown): string | null {
  const fmt = formatOosUntilLabel(untilValue);
  return fmt ? fmt.replace("Out of stock till", "Out of stock (category) till") : null;
}

function normalizeOosUntilIso(value: unknown): string | null {
  const d = parseOosUntilDate(value);
  return d ? d.toISOString() : null;
}

function isMenuItemPlanLocked(item: MenuItemRow): boolean {
  return item.is_locked_by_plan === true;
}

function lockedItemCountLabel(count: number): string {
  return count === 1 ? "1 item is locked" : `${count} items are locked`;
}

function lockedItemsUpgradeMessage(count: number): string {
  const unlock = count === 1 ? "unlock it" : "unlock them";
  return `${lockedItemCountLabel(count)}. Please upgrade your current plan to ${unlock}.`;
}

function lockedItemTapMessage(): string {
  return "This item is locked. Please upgrade your current plan to unlock it.";
}

function buildCatalogItemDetailLines(item: MenuItemRow): string[] {
  const lines: string[] = [];
  if (item.item_description?.trim()) {
    lines.push(item.item_description.trim());
  }

  const meta: string[] = [];
  if (item.food_type) {
    meta.push(FOOD_TYPE_LABELS[item.food_type] ?? item.food_type);
  }
  if (item.preparation_time_minutes != null && item.preparation_time_minutes > 0) {
    meta.push(`${item.preparation_time_minutes} min`);
  }
  const packNum = item.packaging_charges != null ? Number(item.packaging_charges) : NaN;
  if (Number.isFinite(packNum) && packNum > 0) {
    meta.push(`Pack ₹${packNum.toFixed(0)}`);
  }
  if (item.serves_label?.trim()) {
    meta.push(item.serves_label.trim());
  } else if (item.serves != null && item.serves > 0) {
    meta.push(`${item.serves} ${item.serves === 1 ? "person" : "people"}`);
  }
  if (item.item_size_value != null && item.item_size_value > 0 && item.item_size_unit?.trim()) {
    const sizeVal =
      Number(item.item_size_value) === Math.floor(Number(item.item_size_value))
        ? String(Math.floor(Number(item.item_size_value)))
        : String(Number(item.item_size_value));
    meta.push(`${sizeVal} ${item.item_size_unit.trim()}`);
  }
  if (meta.length > 0) lines.push(meta.join(" · "));

  const tags: string[] = [];
  if (item.has_variants) tags.push("Variants");
  if (item.has_customizations) tags.push("Customizations");
  if (item.has_addons) tags.push("Add-ons");
  if (item.has_pending_change_request) {
    tags.push(
      item.pending_change_request_type === "DELETE"
        ? "Delete requested"
        : item.pending_change_request_type === "UPDATE"
          ? "Edit requested"
          : "Change requested",
    );
  }
  if (itemPhotoInReview(item)) tags.push("Image in review");
  else if (item.approval_status === "PENDING") tags.push("Approval pending");
  if (itemPhotoRejected(item)) tags.push("Photo rejected");
  if (tags.length > 0) lines.push(tags.join(" · "));

  return lines;
}

function itemHasCatalogPhoto(item: MenuItemRow): boolean {
  return Boolean(item.item_image_url) || (item.image_count ?? 0) > 0;
}

function itemPhotoInReview(item: MenuItemRow): boolean {
  if (!item.item_image_url) return false;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "PENDING") return true;
  return item.approval_status === "PENDING";
}

function itemPhotoRejected(item: MenuItemRow): boolean {
  if (!item.item_image_url) return false;
  const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
  if (primaryMod === "REJECTED") return true;
  return item.approval_status === "REJECTED";
}

function CatalogCategoryHeader({
  title,
  count,
  isOpen,
  allInStock,
  outOfStockCount,
  onToggleOpen,
  onToggleStock,
  onMenuPress,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  allInStock: boolean;
  outOfStockCount: number;
  onToggleOpen: () => void;
  onToggleStock: () => void;
  onMenuPress: () => void;
}) {
  const oosLabel = `${title.toUpperCase()} (${count})`;
  return (
    <View style={styles.treeGroupHeader}>
      <View style={styles.treeGroupTopRow}>
        <View style={styles.treeGroupTitleWrap}>
          <Text style={styles.treeGroupTitle} numberOfLines={1}>
            {title}{" "}
            <Text style={styles.treeCountText}>({count})</Text>
          </Text>
        </View>
        <View style={styles.treeGroupTopActions}>
          <TouchableOpacity
            onPress={onToggleOpen}
            style={styles.treeHeaderIconBtn}
            hitSlop={8}
            accessibilityLabel={isOpen ? "Collapse category" : "Expand category"}
          >
            <Ionicons
              name={isOpen ? "chevron-down" : "chevron-forward"}
              size={20}
              color={GatiMitraMerchant.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMenuPress}
            style={styles.treeHeaderIconBtn}
            hitSlop={8}
            accessibilityLabel="Category options"
          >
            <Ionicons name="ellipsis-vertical" size={18} color={GatiMitraMerchant.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.treeGroupOosRow, !allInStock && styles.treeGroupOosRowOff]}>
        <View style={styles.treeGroupOosLeft}>
          <Text style={[styles.treeGroupOosLabel, !allInStock && styles.treeGroupOosLabelOff]} numberOfLines={1}>
            {oosLabel}
          </Text>
          {outOfStockCount > 0 ? (
            <Text style={styles.treeGroupMeta} numberOfLines={1}>
              {outOfStockCount} item{outOfStockCount === 1 ? "" : "s"} out of stock
            </Text>
          ) : null}
        </View>
        <CatalogStockToggle
          value={allInStock}
          onValueChange={onToggleStock}
          size="md"
          accessibilityLabel="Category in stock"
        />
      </View>
    </View>
  );
}

function MenuItemCard({
  item,
  onToggleEffectiveStock,
  onToggleRecommended,
  effectiveInStock,
  getItemOosLabel,
  onMoreOptions,
  onOpenPreview,
  onOpenPhoto,
  photoUpload,
}: {
  item: MenuItemRow;
  onToggleEffectiveStock: (item: MenuItemRow, nextInStock: boolean) => void;
  onToggleRecommended: (item: MenuItemRow, nextRecommended: boolean) => void;
  effectiveInStock: (item: MenuItemRow) => boolean;
  getItemOosLabel: (item: MenuItemRow) => string | null;
  onMoreOptions: (item: MenuItemRow) => void;
  onOpenPreview: (item: MenuItemRow) => void;
  onOpenPhoto: (item: MenuItemRow) => void;
  photoUpload?: { previewUri: string; progress: number } | null;
}) {
  const [toggling, setToggling] = useState(false);
  const { token } = useAuth();
  const baseNum = Number(item.base_price);
  const sellingNum = Number(item.selling_price);
  const baseFormatted = baseNum > 0 ? `₹${baseNum.toFixed(0)}` : `₹${sellingNum.toFixed(0)}`;
  const detailLines = buildCatalogItemDetailLines(item);
  const oosLabel = getItemOosLabel(item);
  const isLocked = isMenuItemPlanLocked(item);
  const inStock = effectiveInStock(item);
  const isRecommended = Boolean(item.is_recommended);
  const imageUri = item.item_image_url;
  const isUploading = Boolean(photoUpload);
  const showImage = Boolean(imageUri) || isUploading || itemHasCatalogPhoto(item);
  const photoRejected = !isUploading && itemPhotoRejected(item);
  const photoReviewing = !isUploading && itemPhotoInReview(item);
  const imageCount = Math.max(0, item.image_count ?? (item.item_image_url ? 1 : 0));

  useEffect(() => {
    if (!imageUri || !token) return;
    void prefetchAuthImage(imageUri, token);
  }, [imageUri, token]);

  const handleRecommendToggle = () => {
    if (isLocked) return;
    onToggleRecommended(item, !isRecommended);
  };

  const handleStockToggle = (nextInStock: boolean) => {
    if (toggling || isLocked) return;
    setToggling(true);
    onToggleEffectiveStock(item, nextInStock);
    setTimeout(() => setToggling(false), 250);
  };

  const openPhoto = () => {
    if (isLocked) return;
    onOpenPhoto(item);
  };

  const openPreview = () => {
    onOpenPreview(item);
  };

  return (
    <Pressable
      style={[styles.catalogItemRow, isLocked && styles.catalogItemRowLocked]}
      onLongPress={() => {
        if (!isLocked) onMoreOptions(item);
      }}
      delayLongPress={450}
    >
      <View style={styles.catalogItemMain}>
        <View style={styles.catalogItemLeft}>
          <View style={styles.catalogItemTitleRow}>
            <ItemVegMark vegNonveg={item.food_type} name={item.item_name} size={14} />
            <View style={styles.catalogItemNamePriceRow}>
              <Text style={[styles.catalogItemName, isLocked && styles.itemNameLocked]} numberOfLines={2}>
                {item.item_name}
              </Text>
              <Text style={styles.catalogItemPriceInline}>{baseFormatted}</Text>
            </View>
          </View>
          {detailLines.map((line, idx) => (
            <Text
              key={`${item.id}-detail-${idx}`}
              style={idx === 0 ? styles.catalogItemDescription : styles.catalogItemMeta}
              numberOfLines={idx === 0 ? 2 : 1}
            >
              {line}
            </Text>
          ))}
          {isLocked ? (
            <Text style={styles.lockedSubtext} numberOfLines={2}>
              Locked — upgrade your current plan to unlock
            </Text>
          ) : null}
        </View>

        <Pressable
          style={[
            styles.catalogItemImageWrap,
            isUploading && styles.catalogItemImageWrapUploading,
          ]}
          onPress={openPhoto}
          disabled={isLocked || isUploading}
        >
          {isUploading && photoUpload ? (
            <CatalogPhotoUploadingOverlay
              previewUri={photoUpload.previewUri}
              progress={photoUpload.progress}
            />
          ) : showImage ? (
            <AuthProxyImage
              uri={imageUri}
              token={token}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.catalogAddPhoto}>
              <Ionicons name="camera-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.catalogAddPhotoText}>Add photo</Text>
            </View>
          )}
          {imageCount > 0 && !isLocked && !isUploading ? (
            <View style={styles.catalogImageCountBadge} pointerEvents="none">
              <Ionicons name="camera" size={11} color="#FFFFFF" />
              <Text style={styles.catalogImageCountText}>{imageCount}</Text>
            </View>
          ) : null}
          {isLocked ? (
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={10} color="#fff" />
              <Text style={styles.lockedBadgeText}>Locked</Text>
            </View>
          ) : null}
          {photoReviewing ? (
            <View style={styles.catalogPhotoReviewing} pointerEvents="none">
              <Text style={styles.catalogPhotoReviewingText}>Image in review</Text>
              <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
            </View>
          ) : null}
          {photoRejected ? (
            <View style={styles.catalogPhotoRejected} pointerEvents="none">
              <Text style={styles.catalogPhotoRejectedText}>Rejected</Text>
              <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.catalogItemActions}>
        <TouchableOpacity
          style={styles.catalogRecommendBtn}
          onPress={handleRecommendToggle}
          disabled={isLocked}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="switch"
          accessibilityState={{ checked: isRecommended }}
          accessibilityLabel="Recommend item"
        >
          <Ionicons
            name={isRecommended ? "thumbs-up" : "thumbs-up-outline"}
            size={16}
            color={isRecommended ? GatiMitraMerchant.primary : GatiMitraMerchant.textSecondary}
          />
          <Text
            style={[
              styles.catalogRecommendLabel,
              isRecommended && styles.catalogRecommendLabelOn,
            ]}
          >
            Recommend
          </Text>
        </TouchableOpacity>

        <View style={styles.catalogStockBlock}>
          <CatalogStockToggle
            value={inStock}
            onValueChange={handleStockToggle}
            disabled={toggling || isLocked}
          />
          <Text style={inStock ? styles.catalogStockLabel : styles.catalogStockLabelOff}>
            In stock
          </Text>
        </View>

        <TouchableOpacity
          onPress={openPreview}
          style={styles.catalogEditBtn}
          activeOpacity={0.75}
          accessibilityLabel="Edit item"
        >
          <Ionicons name="pencil" size={12} color={GatiMitraMerchant.textPrimary} />
          <Text style={styles.catalogEditText}>Edit</Text>
        </TouchableOpacity>
      </View>
      {oosLabel ? (
        <Text style={styles.catalogOosHintBelow} numberOfLines={1}>
          {oosLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ComboCard({
  combo,
  detail,
  itemById,
  onPress,
  isDisabled,
  onMoreOptions,
  effectiveComboInStock,
  onToggleComboStock,
}: {
  combo: ComboRow;
  detail: ComboDetail | null;
  itemById: Map<number, MenuItemRow>;
  onPress: () => void;
  isDisabled: boolean;
  onMoreOptions: () => void;
  effectiveComboInStock: (combo: ComboRow, detail: ComboDetail | null, itemById: Map<number, MenuItemRow>) => boolean;
  onToggleComboStock: (combo: ComboRow, nextInStock: boolean) => void;
}) {
  const [imageError, setImageError] = useState(false);

  const components = detail?.components ?? [];
  const componentItems = components.map((comp) => {
    const item = itemById.get(comp.menu_item_id);
    const price = item ? Number(item.selling_price) || 0 : 0;
    return { comp, item, price };
  });

  componentItems.sort((a, b) => b.price - a.price);
  const topComponents = componentItems.slice(0, 2);

  const imageUris = topComponents
    .map((ci) =>
      ci.item?.item_image_url
        ? resolveImageUrl(ci.item.item_image_url) ?? ci.item.item_image_url
        : null
    )
    .filter((u): u is string => Boolean(u) && !imageError);

  const lineRows = components.map((comp) => {
    const item = itemById.get(comp.menu_item_id);
    const name = item?.item_name ?? `Item #${comp.menu_item_id}`;
    const qty = comp.quantity ?? 1;
    return { key: comp.id, text: `${name} × ${qty}` };
  });

  const maxLinesToShow = 3;
  const shownLines = lineRows.slice(0, maxLinesToShow);
  const remainingCount = (lineRows?.length ?? 0) - (shownLines?.length ?? 0);

  const comboPrice = `₹${Number(combo.combo_price).toFixed(0)}`;
  const comboInStock = effectiveComboInStock(combo, detail, itemById);
  const comboOosUntil = (combo as any)?.out_of_stock_until as string | null | undefined;
  const comboOosManual = Boolean((combo as any)?.out_of_stock_manual);
  const comboUnavailableReason = !comboInStock
    ? comboOosUntil
      ? (formatOosUntilLabel(comboOosUntil) ?? "Out of stock")
      : comboOosManual
        ? "No time set. Turn item in stock manually"
        : "Marked out of stock"
    : isDisabled
      ? "Not available · an item is out of stock"
      : null;

  return (
    <View style={[styles.itemCard, (!comboInStock || isDisabled) && styles.comboCardDisabled]}>
      <TouchableOpacity
        style={styles.itemTouchable}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View style={styles.itemImageWrap}>
          <View style={styles.comboImageStack}>
            {(imageUris?.length ?? 0) === 0 ? (
              <View style={styles.itemImagePlaceholder}>
                <Ionicons
                  name="layers-outline"
                  size={32}
                  color={GatiMitraMerchant.primary}
                />
              </View>
            ) : (imageUris?.length ?? 0) === 1 ? (
              <Image
                source={{ uri: imageUris[0] }}
                style={styles.comboImageSingle}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.comboImageColumn}>
                <Image
                  source={{ uri: imageUris[0] }}
                  style={styles.comboImageColumnCell}
                  resizeMode="cover"
                  onError={() => setImageError(true)}
                />
                <Image
                  source={{ uri: imageUris[1] }}
                  style={styles.comboImageColumnCell}
                  resizeMode="cover"
                  onError={() => setImageError(true)}
                />
              </View>
            )}
          </View>
          <View style={styles.comboBadge}>
            <Text style={styles.comboBadgeText}>Combo</Text>
          </View>
        </View>
        <View style={styles.itemBody}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemName} numberOfLines={2}>
              {combo.combo_name}
            </Text>
            <View style={styles.itemHeaderActions}>
              <CatalogStockToggle
                value={comboInStock && !isDisabled}
                onValueChange={(v) => onToggleComboStock(combo, v)}
                disabled={isDisabled}
              />
              <TouchableOpacity
                onPress={onMoreOptions}
                style={styles.moreBtn}
                hitSlop={8}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color={GatiMitraMerchant.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>
          {combo.description?.trim() ? (
            <Text style={styles.itemDescription} numberOfLines={2}>
              {combo.description.trim()}
            </Text>
          ) : null}
          {(shownLines?.length ?? 0) > 0 ? (
            <View style={styles.comboItemsList}>
              {shownLines.map((row) => (
                <Text key={row.key} style={styles.comboItemLine} numberOfLines={1}>
                  {row.text}
                </Text>
              ))}
              {remainingCount > 0 && (
                <Text style={styles.comboItemMore} numberOfLines={1}>
                  +{remainingCount} more
                </Text>
              )}
            </View>
          ) : null}
          {(components?.length ?? 0) < 2 ? (
            <Text style={styles.comboIncompleteHint} numberOfLines={2}>
              {(components?.length ?? 0) === 0
                ? "No items yet — tap to add menu items."
                : "Add one more menu item — combos need at least two."}
            </Text>
          ) : null}
          <View style={styles.priceRow}>
            <Text
              style={[
                styles.sellingPrice,
                (isDisabled || !comboInStock) && styles.comboPriceDisabled,
              ]}
            >
              {comboPrice}
            </Text>
            {comboUnavailableReason && (
              <Text style={styles.comboUnavailableText}>
                {comboUnavailableReason}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;
  const scrollRef = useRef<ScrollView>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>({});

  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("ALL");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [changeRequestFilter, setChangeRequestFilter] = useState<ChangeRequestFilter>("ALL");
  const [kindFilter, setKindFilter] = useState<ItemKindFilter>("ALL");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [viewMode, setViewMode] = useState<MenuViewMode>("tree");
  const [openTreeGroups, setOpenTreeGroups] = useState<Record<string, boolean>>({});
  const [categoryFilterSheetVisible, setCategoryFilterSheetVisible] = useState(false);
  const [subcategoryFilterSheetVisible, setSubcategoryFilterSheetVisible] = useState(false);
  const [statusFilterSheetVisible, setStatusFilterSheetVisible] = useState(false);
  const [stockFilterSheetVisible, setStockFilterSheetVisible] = useState(false);
  const [changeRequestFilterSheetVisible, setChangeRequestFilterSheetVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [manageSheetExpandedIds, setManageSheetExpandedIds] = useState<Set<number>>(new Set());
  const [itemAction, setItemAction] = useState<{ type: "delete" | "request-delete"; itemId: number; itemName: string } | null>(null);
  const [oosModal, setOosModal] = useState<
    | null
    | { kind: "ITEM"; itemId: number; itemName: string; scheduleTitle?: string }
    | { kind: "CATEGORY"; categoryId: number; categoryName: string }
    | { kind: "COMBO"; comboId: number; comboName: string }
  >(null);
  const [itemPreviewSheet, setItemPreviewSheet] = useState<MenuItemRow | null>(null);
  const [itemPhotoSheet, setItemPhotoSheet] = useState<MenuItemRow | null>(null);
  const [itemUploadSheet, setItemUploadSheet] = useState<MenuItemRow | null>(null);
  const [photoUploadByItemId, setPhotoUploadByItemId] = useState<
    Record<number, { previewUri: string; progress: number }>
  >({});
  const [photoUploadToast, setPhotoUploadToast] = useState<{
    previewUri: string;
    visible: boolean;
  } | null>(null);
  const [imagePlan, setImagePlan] = useState<MenuImageUploadStatus | null>(null);
  const [categoryMenuTarget, setCategoryMenuTarget] = useState<{
    categoryId: number;
    displayName: string;
  } | null>(null);
  const [oosBusy, setOosBusy] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<null | {
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(MENU_VIEW_MODE_KEY);
        if (!mounted) return;
        if (raw === "card" || raw === "tree") setViewMode(raw);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await SecureStore.setItemAsync(MENU_VIEW_MODE_KEY, viewMode);
      } catch {
        // ignore
      }
    })();
  }, [viewMode]);

  useEffect(() => {
    if (!storeId || !token) {
      setImagePlan(null);
      return;
    }
    let cancelled = false;
    void fetchMenuImageUploadStatus(storeId, token)
      .then((status) => {
        if (!cancelled) setImagePlan(status);
      })
      .catch(() => {
        if (!cancelled) setImagePlan(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  const { data: categories = [], refetch: refetchCategories, isRefetching: categoriesRefetching } = useMenuCategories(storeId, token);
  const selectedCategory = selectedCategoryId != null ? categories.find((c) => c.id === selectedCategoryId) : null;
  const isMainCategory = selectedCategory != null && selectedCategory.parent_category_id == null;
  const subcategoriesOfSelected = isMainCategory && selectedCategoryId != null
    ? categories.filter((c) => c.parent_category_id === selectedCategoryId)
    : [];
  const effectiveCategoryId = selectedSubcategoryId ?? selectedCategoryId;
  const manageParentCategories = useMemo(
    () => categories.filter((c) => !c.parent_category_id).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [categories]
  );
  const manageChildrenByParentId = useMemo(() => {
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

  const toggleManageSheetExpanded = useCallback((parentId: number) => {
    setManageSheetExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (manageSheetVisible && (manageParentCategories?.length ?? 0) > 0) {
      setManageSheetExpandedIds((prev) => {
        const next = new Set(prev);
        manageParentCategories.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }, [manageSheetVisible, manageParentCategories]);
  const {
    data: catalogData,
    isPending: catalogPending,
    error: catalogError,
    refetch: refetchCatalog,
    isRefetching: catalogRefetching,
  } = useMenuItems(storeId, token, MENU_CATALOG_LIST_FILTERS);
  const allItems = catalogData?.items ?? [];
  const catalogTotal = catalogData?.total ?? allItems.length;

  // Warm disk/memory image cache as soon as catalog rows arrive (survives force-close).
  useEffect(() => {
    if (!token || allItems.length === 0) return;
    prefetchAuthImages(
      allItems.map((it) => it.item_image_url).filter(Boolean),
      token,
    );
  }, [token, catalogData?.items]);

  useEffect(() => {
    if (!storeId) return;
    const hasStaleExpired =
      allItems.some(
        (item) =>
          !(item as any).out_of_stock_manual &&
          (item as any).out_of_stock_until != null &&
          new Date(String((item as any).out_of_stock_until)).getTime() <= nowTick &&
          item.in_stock === false
      ) ||
      categories.some(
        (c) =>
          !c.out_of_stock_manual &&
          c.out_of_stock_until != null &&
          new Date(String(c.out_of_stock_until)).getTime() <= nowTick
      );
    if (!hasStaleExpired) return;
    void refetchCatalog();
    void refetchCategories();
  }, [nowTick, storeId, allItems, categories, refetchCatalog, refetchCategories]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const isOosActive = useCallback(
    (manual?: boolean | null, until?: unknown) => isOosActiveAt(manual, until, nowTick),
    [nowTick]
  );
  /** Category OOS blocks an item only when the item row still carries the category cascade marker (Partner Site parity). */
  const isItemBlockedByCategoryOos = useCallback(
    (item: MenuItemRow) => {
      const categoryId = item.category_id ?? null;
      if (categoryId == null) return false;
      const c: any = categoryById.get(categoryId);
      if (!c) return false;
      const catOos = isOosActive(c.out_of_stock_manual, c.out_of_stock_until ?? null);
      if (!catOos) return false;
      const catMarker = c.out_of_stock_updated_at ?? null;
      const itemMarker = (item as any).out_of_stock_updated_at ?? null;
      if (!catMarker || !itemMarker) return false;
      return String(itemMarker) === String(catMarker);
    },
    [categoryById, isOosActive]
  );
  const itemInStockIgnoringCategory = useCallback(
    (item: MenuItemRow) => {
      if (isOosActive((item as any).out_of_stock_manual, (item as any).out_of_stock_until ?? null)) {
        return false;
      }
      if (
        !(item as any).out_of_stock_manual &&
        (item as any).out_of_stock_until != null &&
        item.in_stock === false
      ) {
        const d = parseOosUntilDate((item as any).out_of_stock_until);
        if (d && d.getTime() > nowTick) return false;
        if (!d) return false;
      }
      if (
        !(item as any).out_of_stock_manual &&
        (item as any).out_of_stock_until == null &&
        item.in_stock === false &&
        ((item as any).out_of_stock_updated_at == null ||
          String((item as any).out_of_stock_updated_at).trim() === "")
      ) {
        return false;
      }
      return true;
    },
    [isOosActive, nowTick]
  );
  const effectiveInStock = useCallback(
    (item: MenuItemRow) => {
      if (typeof item.effective_in_stock === "boolean") return item.effective_in_stock;
      if (!itemInStockIgnoringCategory(item)) return false;
      return !isItemBlockedByCategoryOos(item);
    },
    [isItemBlockedByCategoryOos, itemInStockIgnoringCategory]
  );

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (effectiveCategoryId != null) {
      list = list.filter((it) => it.category_id === effectiveCategoryId);
    }
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      list = list.filter(
        (it) =>
          it.item_name.toLowerCase().includes(q) ||
          String(it.item_description ?? "").toLowerCase().includes(q)
      );
    }
    if (approvalFilter !== "ALL") {
      list = list.filter((it) => (it.approval_status ?? null) === approvalFilter);
    }
    if (changeRequestFilter !== "ALL") {
      list = list.filter((it) => {
        if (!it.has_pending_change_request) return false;
        if (changeRequestFilter === "DELETE") return it.pending_change_request_type === "DELETE";
        return it.pending_change_request_type === "UPDATE";
      });
    }
    if (stockFilter === "IN_STOCK") {
      list = list.filter((it) => effectiveInStock(it));
    } else if (stockFilter === "OUT_OF_STOCK") {
      list = list.filter((it) => !effectiveInStock(it));
    }
    return list;
  }, [
    allItems,
    effectiveCategoryId,
    searchDebounced,
    approvalFilter,
    changeRequestFilter,
    stockFilter,
    effectiveInStock,
  ]);

  const hasActiveItemFilters =
    effectiveCategoryId != null ||
    Boolean(searchDebounced) ||
    approvalFilter !== "ALL" ||
    stockFilter !== "ALL" ||
    changeRequestFilter !== "ALL";
  const hasActiveCatalogFilters = hasActiveItemFilters || kindFilter !== "ALL";

  const clearCatalogFilters = useCallback(() => {
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
    setApprovalFilter("ALL");
    setStockFilter("ALL");
    setChangeRequestFilter("ALL");
    setKindFilter("ALL");
  }, []);
  const items = filteredItems;
  const total = hasActiveItemFilters ? filteredItems.length : catalogTotal;
  const getItemOosLabel = useCallback(
    (item: MenuItemRow) => {
      if (effectiveInStock(item)) return null;

      if (item.category_id != null) {
        const c: any = categoryById.get(item.category_id);
        if (c && isItemBlockedByCategoryOos(item)) {
          if (Boolean(c.out_of_stock_manual ?? item.category_out_of_stock_manual)) {
            return "Out of stock (category) · manual";
          }
          const catUntil = c.out_of_stock_until ?? item.category_out_of_stock_until ?? null;
          if (catUntil && isOosActiveAt(c.out_of_stock_manual, catUntil, nowTick)) {
            return categoryOosUntilLabel(catUntil) ?? "Out of stock (category)";
          }
          if (item.out_of_stock_until && isOosActiveAt(false, item.out_of_stock_until, nowTick)) {
            return categoryOosUntilLabel(item.out_of_stock_until) ?? "Out of stock (category)";
          }
          return "Out of stock (category)";
        }
      }

      if (item.out_of_stock_manual) return "Out of stock · manual";

      const until = item.out_of_stock_until ?? item.category_out_of_stock_until ?? null;
      if (until && isOosActiveAt(false, until, nowTick)) {
        return formatOosUntilLabel(until) ?? "Out of stock";
      }

      if (item.in_stock === false) return "Out of stock";
      return "Out of stock";
    },
    [categoryById, effectiveInStock, isItemBlockedByCategoryOos, nowTick]
  );

  // Combos (kept here so modal counts + UI can use it safely)
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [comboDetails, setComboDetails] = useState<Map<number, ComboDetail>>(new Map());
  const [combosLoading, setCombosLoading] = useState(false);
  const [combosReady, setCombosReady] = useState(false);

  // For counts inside the Categories popup (should not change with filters)
  const manageCategoryRows = useMemo(() => {
    // Build rows exactly like Tree groups (so tap can scroll there).
    const byKey = new Map<string, { key: string; label: string; count: number }>();
    for (const it of allItems) {
      const label = (() => {
        if (it.category_id == null) return "Uncategorised";
        const c = categories.find((x) => x.id === it.category_id);
        if (!c) return "Uncategorised";
        if (c.parent_category_id == null) return c.category_name;
        const p = categories.find((x) => x.id === c.parent_category_id);
        return p ? `${p.category_name}` : c.category_name;
      })();
      const key = String(it.category_id ?? "uncategorised");
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { key, label, count: 1 });
    }
    const rows: Array<{
      key: string;
      type: "category" | "combos";
      id: number;
      label: string;
      count: number;
    }> = Array.from(byKey.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((r) => ({ key: r.key, type: "category" as const, id: -1, label: r.label, count: r.count }));
    rows.push({ key: "combos", type: "combos", id: -1, label: "Combos", count: combos?.length ?? 0 });
    return rows;
  }, [allItems, categories, combos]);

  const handleJumpToSection = useCallback(
    (key: string) => {
      if (key === "combos") {
        if (kindFilter === "ITEMS" || kindFilter === "ADDONS") setKindFilter("ALL");
      } else if (kindFilter === "COMBOS" || kindFilter === "ADDONS") {
        setKindFilter("ALL");
      }
      setOpenTreeGroups((prev) => ({ ...prev, [key]: true }));
      setManageSheetVisible(false);
      requestAnimationFrame(() => {
        setTimeout(() => {
          const y = sectionOffsets[key];
          if (typeof y === "number") {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
          }
        }, 120);
      });
    },
    [sectionOffsets, kindFilter]
  );

  /** Full-menu map for combo components — filtered `items` would hide names/stock for items outside the current category. */
  const itemById = useMemo(() => {
    const map = new Map<number, MenuItemRow>();
    for (const it of allItems) map.set(it.id, it);
    return map;
  }, [allItems]);

  const itemsTreeGroups = useMemo(() => {
    const map = new Map<string, { key: string; categoryName: string; items: MenuItemRow[] }>();
    for (const it of items) {
      const displayName = (() => {
        if (it.category_id == null) return "Uncategorised";
        const c = categories.find((x) => x.id === it.category_id);
        if (!c) return "Uncategorised";
        if (c.parent_category_id == null) return c.category_name;
        const p = categories.find((x) => x.id === c.parent_category_id);
        return p ? `${p.category_name} (${c.category_name})` : c.category_name;
      })();
      const categoryName =
        displayName;
      const key = String(it.category_id ?? "uncategorised");
      const existing = map.get(key);
      if (existing) existing.items.push(it);
      else map.set(key, { key, categoryName, items: [it] });
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    return groups;
  }, [items, categories]);

  const treeKeysSig = useMemo(() => itemsTreeGroups.map((g) => g.key).join("|"), [itemsTreeGroups]);
  useEffect(() => {
    if (viewMode !== "tree" && viewMode !== "card") return;
    // Default open all groups, but preserve any manual closes.
    setOpenTreeGroups((prev) => {
      let changed = false;
      const next: Record<string, boolean> = { ...prev };
      for (const g of itemsTreeGroups) {
        if (next[g.key] == null) {
          next[g.key] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [viewMode, treeKeysSig, itemsTreeGroups]);

  const [custDetailsById, setCustDetailsById] = useState<Record<number, MenuItemDetail>>({});
  const queryClient = useQueryClient();

  const custItemIds = useMemo(
    () => allItems.filter(itemHasCustomizationContent).map((i) => i.id),
    [allItems]
  );

  const custItemIdsSig = useMemo(() => custItemIds.join(","), [custItemIds]);

  const custScopeRows = useMemo(() => {
    let list = allItems.filter(itemHasCustomizationContent);
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      list = list.filter(
        (i) =>
          i.item_name.toLowerCase().includes(q) ||
          String(i.item_id ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allItems, searchDebounced]);

  useEffect(() => {
    if (kindFilter !== "ADDONS") return;
    if (!storeId || !token || custItemIds.length === 0) return;

    let cancelled = false;

    for (const id of custItemIds) {
      const cached = queryClient.getQueryData<MenuItemDetail>(menuKeys.item(storeId, id));
      if (cached) {
        setCustDetailsById((prev) => (prev[id] ? prev : { ...prev, [id]: cached }));
      }
    }

    void Promise.all(
      custItemIds.map(async (id) => {
        if (cancelled) return;
        const key = menuKeys.item(storeId, id);
        if (queryClient.getQueryData<MenuItemDetail>(key)) return;
        try {
          const detail = await queryClient.fetchQuery({
            queryKey: key,
            queryFn: () => fetchMenuItem(storeId, id, token),
            staleTime: 5 * 60 * 1000,
          });
          if (!cancelled && detail) {
            setCustDetailsById((prev) => (prev[id] ? prev : { ...prev, [id]: detail }));
          }
        } catch {
          // ignore — row stays in per-item loading state
        }
      })
    );

    return () => {
      cancelled = true;
    };
  }, [kindFilter, storeId, token, custItemIdsSig, custItemIds, queryClient]);

  const handleCustDetailsChange = useCallback((itemId: number, detail: MenuItemDetail) => {
    setCustDetailsById((prev) => ({ ...prev, [itemId]: detail }));
    if (storeId) {
      queryClient.setQueryData(menuKeys.item(storeId, itemId), detail);
    }
  }, [queryClient, storeId]);

  useEffect(() => {
    if (!storeId || !token) return;

    let cancelled = false;
    setCombosReady(false);
    void (async () => {
      try {
        const res = await fetchCombos(storeId, token);
        if (cancelled) return;
        const rows = res.combos ?? [];
        setCombos(rows);

        void Promise.all(
          rows.map(async (c) => {
            try {
              const d = await fetchCombo(storeId, c.id, token);
              return d ? [c.id, d] as const : null;
            } catch {
              return null;
            }
          })
        ).then((detailEntries) => {
          if (cancelled) return;
          const map = new Map<number, ComboDetail>();
          for (const entry of detailEntries) {
            if (!entry) continue;
            map.set(entry[0], entry[1]);
          }
          setComboDetails(map);
        });
      } catch {
        if (!cancelled) {
          setCombos([]);
          setComboDetails(new Map());
        }
      } finally {
        if (!cancelled) setCombosReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  const patchStock = usePatchItemStock(storeId, token);
  const refreshing = categoriesRefetching || catalogRefetching;

  const handleAddItem = useCallback(() => {
    setAddMenuVisible(false);
    if ((categories?.length ?? 0) === 0) {
      // Open Add Category form first — items require at least one category.
      router.push("/menu/categories?add=1" as any);
      return;
    }
    router.push("/menu/add-edit-item" as any);
  }, [categories, router]);

  const onRefresh = useCallback(() => {
    if (!storeId || !token) return;
    refetchCategories();
    refetchCatalog();
  }, [storeId, token, refetchCategories, refetchCatalog]);

  const handleToggleStock = useCallback(
    async (itemId: number, inStock: boolean) => {
      try {
        await patchStock.mutateAsync({ itemId, inStock });
      } catch {
        // Cache invalidated; list will refetch. Could toast on error.
      }
    },
    [patchStock]
  );

  const handleToggleEffectiveStock = useCallback(
    async (item: MenuItemRow, nextInStock: boolean) => {
      if (!storeId || !token) return;
      if (!nextInStock) {
        setOosModal({ kind: "ITEM", itemId: item.id, itemName: item.item_name });
        return;
      }
      setRestoreConfirm({
        title: "Bring back in stock?",
        message: "This will make it available to customers and start receiving orders.",
        onConfirm: async () => {
          setRestoreConfirm(null);
          setOosBusy(true);
          try {
            await patchItemOutOfStock(storeId, item.id, token, { mode: "CLEAR" });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            Alert.alert("Could not restore in stock", msg);
          } finally {
            setOosBusy(false);
            setOosModal(null);
            await refetchCatalog();
            await refetchCategories();
          }
        },
      });
    },
    [storeId, token, refetchCatalog, refetchCategories]
  );

  const reloadCombos = useCallback(async () => {
    if (!storeId || !token) return;
    setCombosLoading(true);
    try {
      const res = await fetchCombos(storeId, token);
      const rows = res.combos ?? [];
      setCombos(rows);
      const detailEntries = await Promise.all(
        rows.map(async (c) => {
          try {
            const d = await fetchCombo(storeId, c.id, token);
            return d ? [c.id, d] as const : null;
          } catch {
            return null;
          }
        })
      );
      const map = new Map<number, ComboDetail>();
      for (const entry of detailEntries) {
        if (!entry) continue;
        map.set(entry[0], entry[1]);
      }
      setComboDetails(map);
    } finally {
      setCombosLoading(false);
    }
  }, [storeId, token]);

  const handleConfirmOos = useCallback(
    async (payload: OutOfStockPayload) => {
      if (!storeId || !token || !oosModal) return;
      setOosBusy(true);
      try {
        const mode: ApiOutOfStockMode =
          payload.mode === "HOURS"
            ? "HOURS"
            : payload.mode === "NEXT_OPEN"
              ? "NEXT_OPEN"
              : payload.mode === "CUSTOM"
                ? "CUSTOM"
                : "MANUAL";

        const patchBody = {
          mode,
          hours: payload.mode === "HOURS" ? payload.hours : undefined,
          until: payload.mode === "CUSTOM" ? payload.until : undefined,
        };
        const marker = new Date().toISOString();

        if (oosModal.kind === "ITEM") {
          const result = await patchItemOutOfStock(storeId, oosModal.itemId, token, patchBody);
          const until = normalizeOosUntilIso(result.out_of_stock_until) ?? result.out_of_stock_until;
          setItemPreviewSheet((prev) =>
            prev && prev.id === oosModal.itemId
              ? {
                  ...prev,
                  in_stock: false,
                  out_of_stock_manual: Boolean(result.out_of_stock_manual),
                  out_of_stock_until: until,
                  out_of_stock_updated_at: marker,
                }
              : prev,
          );
          queryClient.setQueriesData<ListItemsResponse>(
            { queryKey: ["menu", "items", storeId] },
            (old) => {
              if (!old?.items) return old;
              return {
                ...old,
                items: old.items.map((it) =>
                  it.id === oosModal.itemId
                    ? {
                        ...it,
                        in_stock: false,
                        out_of_stock_manual: Boolean(result.out_of_stock_manual),
                        out_of_stock_until: until,
                        out_of_stock_updated_at: marker,
                      }
                    : it
                ),
              };
            }
          );
        } else if (oosModal.kind === "CATEGORY") {
          const result = await patchCategoryOutOfStock(storeId, oosModal.categoryId, token, patchBody);
          const until = normalizeOosUntilIso(result.out_of_stock_until) ?? result.out_of_stock_until;
          queryClient.setQueryData<MenuCategory[]>(menuKeys.categories(storeId), (old) =>
            (old ?? []).map((c) =>
              c.id === oosModal.categoryId
                ? {
                    ...c,
                    out_of_stock_manual: Boolean(result.out_of_stock_manual),
                    out_of_stock_until: until,
                    out_of_stock_updated_at: marker,
                  }
                : c
            )
          );
          queryClient.setQueriesData<ListItemsResponse>(
            { queryKey: ["menu", "items", storeId] },
            (old) => {
              if (!old?.items) return old;
              return {
                ...old,
                items: old.items.map((it) => {
                  if ((it.category_id ?? null) !== oosModal.categoryId) return it;
                  const itemAlreadyOos = isOosActive(it.out_of_stock_manual, it.out_of_stock_until ?? null);
                  if (itemAlreadyOos) return it;
                  return {
                    ...it,
                    in_stock: false,
                    out_of_stock_manual: false,
                    out_of_stock_until: until,
                    out_of_stock_updated_at: marker,
                    category_out_of_stock_manual: Boolean(result.out_of_stock_manual),
                    category_out_of_stock_until: until,
                    category_out_of_stock_updated_at: marker,
                  };
                }),
              };
            }
          );
        } else {
          const result = await patchComboOutOfStock(storeId, oosModal.comboId, token, patchBody);
          const until = normalizeOosUntilIso(result.out_of_stock_until) ?? result.out_of_stock_until;
          setCombos((prev) =>
            prev.map((c) =>
              c.id === oosModal.comboId
                ? {
                    ...c,
                    out_of_stock_manual: Boolean(result.out_of_stock_manual),
                    out_of_stock_until: until,
                  }
                : c
            )
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert("Could not update stock", msg);
      } finally {
        setOosBusy(false);
        setOosModal(null);
        await refetchCatalog();
        await refetchCategories();
        await reloadCombos();
      }
    },
    [
      storeId,
      token,
      oosModal,
      queryClient,
      isOosActive,
      refetchCatalog,
      refetchCategories,
      reloadCombos,
    ]
  );

  const handleToggleComboActive = useCallback(
    async (comboId: number, nextActive: boolean) => {
      if (!storeId || !token) return;
      try {
        // Optimistic UI
        setCombos((prev) => prev.map((c) => (c.id === comboId ? { ...c, is_active: nextActive } : c)));
        await updateCombo(storeId, comboId, token, { is_active: nextActive });
      } catch {
        // Revert on failure
        setCombos((prev) => prev.map((c) => (c.id === comboId ? { ...c, is_active: !nextActive } : c)));
      }
    },
    [storeId, token]
  );

  const handleToggleAllCombosActive = useCallback(
    async (nextActive: boolean, comboIds: number[]) => {
      if (!storeId || !token) return;
      if ((comboIds?.length ?? 0) === 0) return;
      // Optimistic UI
      setCombos((prev) => prev.map((c) => (comboIds.includes(c.id) ? { ...c, is_active: nextActive } : c)));
      try {
        await Promise.all(comboIds.map((id) => updateCombo(storeId, id, token, { is_active: nextActive })));
      } catch {
        // Revert (best-effort)
        setCombos((prev) => prev.map((c) => (comboIds.includes(c.id) ? { ...c, is_active: !nextActive } : c)));
      }
    },
    [storeId, token]
  );

  const isComboOosActive = useCallback(
    (combo: ComboRow) => isOosActive((combo as any).out_of_stock_manual, (combo as any).out_of_stock_until ?? null),
    [isOosActive]
  );

  const effectiveComboInStock = useCallback(
    (combo: ComboRow, detail: ComboDetail | null, map: Map<number, MenuItemRow>) => {
      const base = combo.is_active === true;
      const comboOos = isComboOosActive(combo);
      const comps = detail?.components ?? [];
      const componentsOk = comps.every((c) => {
        const it = map.get(c.menu_item_id);
        return it ? effectiveInStock(it) : true;
      });
      return base && !comboOos && componentsOk;
    },
    [effectiveInStock, isComboOosActive]
  );
  const getComboOosLabel = useCallback(
    (combo: ComboRow, detail: ComboDetail | null, map: Map<number, MenuItemRow>) => {
      if (effectiveComboInStock(combo, detail, map)) return null;
      if (Boolean((combo as any)?.out_of_stock_manual)) return "Out of stock · manual";
      const until = (combo as any)?.out_of_stock_until;
      if (until && isOosActiveAt(false, until, nowTick)) return formatOosUntilLabel(until) ?? "Out of stock";
      const blockedByItem = (detail?.components ?? []).some((c) => {
        const it = map.get(c.menu_item_id);
        return it ? !effectiveInStock(it) : false;
      });
      if (blockedByItem) return "Not available · an item is out of stock";
      return "Out of stock";
    },
    [effectiveComboInStock, effectiveInStock, nowTick]
  );

  const handleToggleComboStock = useCallback(
    (combo: ComboRow, nextInStock: boolean) => {
      if (!storeId || !token) return;
      if (!nextInStock) {
        setOosModal({ kind: "COMBO", comboId: combo.id, comboName: combo.combo_name });
        return;
      }
      setRestoreConfirm({
        title: "Bring back in stock?",
        message: "This will make it available to customers and start receiving orders.",
        onConfirm: async () => {
          setRestoreConfirm(null);
          setOosBusy(true);
          try {
            await patchComboOutOfStock(storeId, combo.id, token, { mode: "CLEAR" });
          } finally {
            setOosBusy(false);
            await reloadCombos();
          }
        },
      });
    },
    [storeId, token, reloadCombos]
  );

  const handleOpenItemDetails = useCallback(
    (itemId: number) => {
      router.push({ pathname: "/menu/item-details/[id]", params: { id: String(itemId) } } as any);
    },
    [router]
  );

  const handleMoreOptions = useCallback(
    (item: MenuItemRow) => {
      const isApproved = item.approval_status === "APPROVED";
      const deleteAction = isApproved
        ? {
            text: "Request delete",
            style: "destructive" as const,
            onPress: () => {
              Alert.alert(
                "Request delete?",
                `Submit a delete request for "${item.item_name}"? An agent will review it.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Request delete",
                    style: "destructive",
                    onPress: () => {
                      if (!storeId || !token) return;
                      setItemAction({ type: "request-delete", itemId: item.id, itemName: item.item_name });
                      (async () => {
                        try {
                          await createDeleteRequest(storeId, item.id, token);
                          await refetchCatalog();
                          setItemAction(null);
                          Alert.alert("Request sent", "Delete request submitted. An agent will review it.");
                        } catch (e) {
                          setItemAction(null);
                          Alert.alert(
                            "Request failed",
                            e instanceof Error ? e.message : "Could not submit delete request."
                          );
                        }
                      })();
                    },
                  },
                ]
              );
            },
          }
        : {
            text: "Delete item",
            style: "destructive" as const,
            onPress: () => {
              Alert.alert(
                "Delete item?",
                `Remove "${item.item_name}" from your menu? This cannot be undone.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      if (!storeId || !token) return;
                      setItemAction({ type: "delete", itemId: item.id, itemName: item.item_name });
                      (async () => {
                        try {
                          await deleteMenuItem(storeId, item.id, token);
                          await refetchCatalog();
                          setItemAction(null);
                        } catch (e) {
                          setItemAction(null);
                          Alert.alert(
                            "Delete failed",
                            e instanceof Error ? e.message : "Could not delete item. Please try again."
                          );
                        }
                      })();
                    },
                  },
                ]
              );
            },
          };
      Alert.alert(
        "Item options",
        item.item_name,
        [
          {
            text: "Edit details & images",
            onPress: () =>
              router.push({
                pathname: "/menu/add-edit-item",
                params: { itemId: String(item.id) },
              } as any),
          },
          deleteAction,
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true }
      );
    },
    [storeId, token, refetchCatalog, router]
  );

  const handleCategoryGroupStockToggle = useCallback(
    async (
      group: { key: string; categoryName: string; items: MenuItemRow[] },
      categoryIdNum: number,
      allInStock: boolean,
    ) => {
      if (!storeId || !token) return;
      const target = !allInStock;
      if (Number.isFinite(categoryIdNum) && categoryIdNum > 0) {
        if (!target) {
          setOosModal({ kind: "CATEGORY", categoryId: categoryIdNum, categoryName: group.categoryName });
          return;
        }
        setRestoreConfirm({
          title: "Bring back in stock?",
          message: "This will mark all items in this category as In Stock and available for orders.",
          onConfirm: async () => {
            setRestoreConfirm(null);
            setOosBusy(true);
            try {
              await patchCategoryOutOfStock(storeId, categoryIdNum, token, { mode: "CLEAR" });
              await Promise.all(
                group.items.map(async (it) => {
                  await patchItemOutOfStock(storeId, it.id, token, { mode: "CLEAR" });
                  if (it.in_stock === false) {
                    await patchStock.mutateAsync({ itemId: it.id, inStock: true });
                  }
                }),
              );
            } finally {
              setOosBusy(false);
              await refetchCatalog();
              await refetchCategories();
            }
          },
        });
        return;
      }

      const toUpdate = group.items.filter((i) => effectiveInStock(i) !== target);
      if (toUpdate.length === 0) return;
      try {
        await Promise.all(
          toUpdate.map(async (i) => {
            if (target) {
              await patchItemOutOfStock(storeId, i.id, token, { mode: "CLEAR" });
              if (i.in_stock === false) {
                await patchStock.mutateAsync({ itemId: i.id, inStock: true });
              }
            } else {
              await patchItemOutOfStock(storeId, i.id, token, { mode: "MANUAL" });
            }
          }),
        );
        await refetchCatalog();
      } catch {
        // ignore
      }
    },
    [storeId, token, effectiveInStock, patchStock, refetchCatalog, refetchCategories],
  );

  const openCategoryMenu = useCallback(
    (
      group: { key: string; categoryName: string; items: MenuItemRow[] },
      categoryIdNum: number,
    ) => {
      if (!Number.isFinite(categoryIdNum) || categoryIdNum <= 0) {
        Alert.alert("Category options", "This section cannot be managed.");
        return;
      }
      setCategoryMenuTarget({
        categoryId: categoryIdNum,
        displayName: group.categoryName,
      });
    },
    [],
  );

  const handleOpenItemPreview = useCallback((item: MenuItemRow) => {
    if (isMenuItemPlanLocked(item)) {
      Alert.alert("Item locked", lockedItemTapMessage());
      return;
    }
    setItemPreviewSheet(item);
  }, []);

  const handleOpenItemPhoto = useCallback((item: MenuItemRow) => {
    if (isMenuItemPlanLocked(item)) {
      Alert.alert("Item locked", lockedItemTapMessage());
      return;
    }
    if (photoUploadByItemId[item.id]) return;
    if (imagePlan && !imagePlan.imageUploadAllowed) {
      Alert.alert("Not in plan", "Image uploads are not included in your current plan. Upgrade to add images.");
      return;
    }
    if (imagePlan?.imageLimitReached && !itemHasCatalogPhoto(item)) {
      Alert.alert(
        "Limit exceeded",
        imagePlan.maxImageUploads != null
          ? `Image limit reached (${imagePlan.maxImageUploads}/${imagePlan.maxImageUploads}). Upgrade your plan to add more.`
          : "Image upload limit reached for your plan."
      );
      return;
    }
    if (itemHasCatalogPhoto(item)) {
      if (storeId && token) {
        void prefetchAuthImage(item.item_image_url, token);
        prefetchMenuItemDetail(storeId, item.id, token);
      }
      setItemPhotoSheet(item);
      return;
    }
    setItemUploadSheet(item);
  }, [photoUploadByItemId, storeId, token, imagePlan]);

  const catalogPhotoUploadCallbacks = useMemo<CatalogPhotoUploadCallbacks>(
    () => ({
      onStart: (itemId, previewUri) => {
        setPhotoUploadByItemId((prev) => ({
          ...prev,
          [itemId]: { previewUri, progress: 0.05 },
        }));
      },
      onProgress: (itemId, progress) => {
        setPhotoUploadByItemId((prev) => {
          const cur = prev[itemId];
          if (!cur) return prev;
          return { ...prev, [itemId]: { ...cur, progress } };
        });
      },
      onSuccess: (itemId, previewUri, imageUrl) => {
        setPhotoUploadByItemId((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        if (storeId) {
          invalidateMenuItemCache(storeId, itemId);
          queryClient.setQueriesData<ListItemsResponse>(
            { queryKey: ["menu", "items", storeId] },
            (old) => {
              if (!old?.items) return old;
              return {
                ...old,
                items: old.items.map((it) =>
                  it.id === itemId
                    ? {
                        ...it,
                        approval_status:
                          it.approval_status === "APPROVED" ? "APPROVED" : "PENDING",
                        primary_image_moderation_status: "PENDING",
                        item_image_url: imageUrl ?? previewUri,
                        image_count: Math.max(it.image_count ?? 0, 1),
                      }
                    : it,
                ),
              };
            },
          );
        }
        setPhotoUploadToast({ previewUri, visible: true });
        void refetchCatalog();
      },
      onError: (itemId) => {
        setPhotoUploadByItemId((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      },
    }),
    [refetchCatalog, queryClient, storeId],
  );

  const applyRecommendedLocally = useCallback(
    (itemId: number, value: boolean) => {
      queryClient.setQueriesData<ListItemsResponse>(
        { queryKey: ["menu", "items", storeId] },
        (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((it) =>
              it.id === itemId ? { ...it, is_recommended: value } : it
            ),
          };
        }
      );
      setItemPreviewSheet((prev) =>
        prev && prev.id === itemId ? { ...prev, is_recommended: value } : prev
      );
      setItemPhotoSheet((prev) =>
        prev && prev.id === itemId ? { ...prev, is_recommended: value } : prev
      );
    },
    [queryClient, storeId]
  );

  const recommendRequestSeq = useRef(new Map<number, number>());

  const handleToggleRecommended = useCallback(
    async (item: MenuItemRow, nextRecommended: boolean) => {
      if (!storeId || !token) return;
      const seq = (recommendRequestSeq.current.get(item.id) ?? 0) + 1;
      recommendRequestSeq.current.set(item.id, seq);
      // Flip first so one tap shows immediately; roll back only if this is still the latest tap.
      applyRecommendedLocally(item.id, nextRecommended);
      try {
        await patchItemFlags(storeId, item.id, token, { is_recommended: nextRecommended });
      } catch (e) {
        if (recommendRequestSeq.current.get(item.id) !== seq) return;
        applyRecommendedLocally(item.id, !nextRecommended);
        const msg = e instanceof Error ? e.message : "Could not update recommendation";
        Alert.alert("Update failed", msg);
      }
    },
    [storeId, token, applyRecommendedLocally]
  );

  const handlePreviewUpdateStock = useCallback(() => {
    const item = itemPreviewSheet;
    if (!item) return;
    if (effectiveInStock(item)) {
      setItemPreviewSheet(null);
      setOosModal({
        kind: "ITEM",
        itemId: item.id,
        itemName: item.item_name,
        scheduleTitle: "When will this be available?",
      });
      return;
    }
    setRestoreConfirm({
      title: "Bring back in stock?",
      message: "This will make the item visible to customers on the app.",
      onConfirm: async () => {
        setRestoreConfirm(null);
        if (!storeId || !token) return;
        setOosBusy(true);
        try {
          await patchItemOutOfStock(storeId, item.id, token, { mode: "CLEAR" });
          await refetchCatalog();
          await refetchCategories();
          setItemPreviewSheet((prev) =>
            prev && prev.id === item.id ? { ...prev, in_stock: true } : prev,
          );
        } catch (e) {
          Alert.alert("Could not restore", e instanceof Error ? e.message : "Try again");
        } finally {
          setOosBusy(false);
        }
      },
    });
  }, [
    itemPreviewSheet,
    effectiveInStock,
    storeId,
    token,
    refetchCatalog,
    refetchCategories,
  ]);

  const handlePreviewEditItem = useCallback(() => {
    const item = itemPreviewSheet;
    if (!item) return;
    setItemPreviewSheet(null);
    router.push({
      pathname: "/menu/add-edit-item",
      params: { itemId: String(item.id) },
    } as any);
  }, [itemPreviewSheet, router]);

  const handleComboOptions = useCallback(
    (combo: ComboRow) => {
      Alert.alert(
        "Combo options",
        combo.combo_name,
        [
          {
            text: "Edit combo",
            onPress: () =>
              router.push({
                pathname: "/menu/combos/[id]",
                params: { id: String(combo.id) },
              } as any),
          },
          {
            text: "Delete combo",
            style: "destructive",
            onPress: () => {
              if (!storeId || !token) return;
              Alert.alert(
                "Delete combo?",
                `Remove "${combo.combo_name}" from your catalog? This cannot be undone.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await deleteCombo(storeId, combo.id, token);
                        const res = await fetchCombos(storeId, token);
                        setCombos(res.combos ?? []);
                      } catch (e) {
                        Alert.alert(
                          "Delete failed",
                          e instanceof Error
                            ? e.message
                            : "Could not delete combo. Please try again."
                        );
                      }
                    },
                  },
                ]
              );
            },
          },
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true }
      );
    },
    [router, storeId, token]
  );

  const categoryMap = new Map(categories.map((c) => [c.id, c.category_name]));
  const getCategoryDisplayName = useCallback((c: MenuCategory) => {
    const parent = c.parent_category_id ? categories.find((p) => p.id === c.parent_category_id) : null;
    return parent ? `${parent.category_name} (${c.category_name})` : c.category_name;
  }, [categories]);
  const categoryDisplayNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of categories) {
      m.set(c.id, getCategoryDisplayName(c));
    }
    return m;
  }, [categories, getCategoryDisplayName]);
  const selectedCategoryLabel = selectedCategoryId == null
    ? "All categories"
    : (() => {
        const c = categories.find((x) => x.id === selectedCategoryId);
        return c ? getCategoryDisplayName(c) : "Category";
      })();
  const selectedSubcategoryLabel = selectedSubcategoryId == null
    ? "All subcategories"
    : (categoryMap.get(selectedSubcategoryId) ?? "Subcategory");
  const filteredCategoriesForSheet = categorySearch.trim()
    ? categories.filter((c) => {
        const label = getCategoryDisplayName(c).toLowerCase();
        return label.includes(categorySearch.trim().toLowerCase());
      })
    : categories;
  const canFetch = Boolean(token && storeId);
  const error = catalogError ? (catalogError instanceof Error ? catalogError.message : "Failed to load items") : null;
  const loading = catalogPending && allItems.length === 0;

  const showItems = kindFilter !== "COMBOS" && kindFilter !== "ADDONS";
  const showCombos = kindFilter !== "ITEMS" && kindFilter !== "ADDONS";
  const showAddons = kindFilter === "ADDONS";
  const visibleCombos = useMemo(() => {
    if (!searchDebounced) return combos;
    const q = searchDebounced.toLowerCase();
    return combos.filter((c) => String(c.combo_name ?? "").toLowerCase().includes(q));
  }, [combos, searchDebounced]);
  const totalDisplayed =
    (showItems ? total : 0) +
    (showCombos ? (visibleCombos?.length ?? 0) : 0) +
    (showAddons ? custScopeRows.length : 0);

  const catalogAllCount = catalogTotal + (combos?.length ?? 0);
  const catalogComboCount = combos?.length ?? 0;
  const catalogAddonsCount = useMemo(
    () => allItems.filter(itemHasCustomizationContent).length,
    [allItems]
  );
  const lockedItemsCount = useMemo(
    () => allItems.filter((i) => isMenuItemPlanLocked(i)).length,
    [allItems]
  );
  const catalogKindTab: CatalogKindTab =
    kindFilter === "COMBOS" ? "COMBOS" : kindFilter === "ADDONS" ? "ADDONS" : "ALL";
  const showCatalogKindToggle = effectiveCategoryId == null;

  const handleCatalogKindChange = useCallback((tab: CatalogKindTab) => {
    setKindFilter(tab === "COMBOS" ? "COMBOS" : tab === "ADDONS" ? "ADDONS" : "ALL");
  }, []);

  const renderComboTreeSection = () => {
    if ((visibleCombos?.length ?? 0) === 0) return null;
    const key = "combos";
    const isOpen = openTreeGroups[key] ?? true;
    const allActive =
      visibleCombos.every((c) => effectiveComboInStock(c, comboDetails.get(c.id) ?? null, itemById));

    const outOfStockCombos = visibleCombos.filter(
      (c) => !effectiveComboInStock(c, comboDetails.get(c.id) ?? null, itemById),
    ).length;

    return (
      <View
        style={[styles.treeGroupCard, !allActive && styles.treeGroupCardOos]}
        onLayout={(e) => {
          const y = e.nativeEvent.layout.y;
          setSectionOffsets((prev) => (prev.combos === y ? prev : { ...prev, combos: y }));
        }}
      >
        <CatalogCategoryHeader
          title="Combos"
          count={visibleCombos.length}
          isOpen={isOpen}
          allInStock={allActive}
          outOfStockCount={outOfStockCombos}
          onToggleOpen={() =>
            setOpenTreeGroups((prev) => ({
              ...prev,
              [key]: !isOpen,
            }))
          }
          onToggleStock={() => {
            if (!storeId || !token) return;
            const next = !allActive;
            if (!next) {
              const first = visibleCombos[0];
              if (first) setOosModal({ kind: "COMBO", comboId: first.id, comboName: first.combo_name });
              return;
            }
            setRestoreConfirm({
              title: "Bring back in stock?",
              message: "This will make all combos available to customers and start receiving orders.",
              onConfirm: async () => {
                setRestoreConfirm(null);
                setOosBusy(true);
                try {
                  await Promise.all(
                    visibleCombos.map((c) =>
                      patchComboOutOfStock(storeId, c.id, token, { mode: "CLEAR" }),
                    ),
                  );
                } finally {
                  setOosBusy(false);
                  await reloadCombos();
                }
              },
            });
          }}
          onMenuPress={() => {
            Alert.alert(
              "Combos",
              undefined,
              [
                {
                  text: isOpen ? "Collapse" : "Expand",
                  onPress: () =>
                    setOpenTreeGroups((prev) => ({
                      ...prev,
                      [key]: !prev[key],
                    })),
                },
                {
                  text: allActive ? "Mark out of stock" : "Bring in stock",
                  onPress: () => {
                    if (!storeId || !token) return;
                    const next = !allActive;
                    if (!next) {
                      const first = visibleCombos[0];
                      if (first) setOosModal({ kind: "COMBO", comboId: first.id, comboName: first.combo_name });
                      return;
                    }
                    setRestoreConfirm({
                      title: "Bring back in stock?",
                      message: "This will make all combos available to customers.",
                      onConfirm: async () => {
                        setRestoreConfirm(null);
                        setOosBusy(true);
                        try {
                          await Promise.all(
                            visibleCombos.map((c) =>
                              patchComboOutOfStock(storeId, c.id, token, { mode: "CLEAR" }),
                            ),
                          );
                        } finally {
                          setOosBusy(false);
                          await reloadCombos();
                        }
                      },
                    });
                  },
                },
                { text: "Cancel", style: "cancel" },
              ],
              { cancelable: true },
            );
          }}
        />

        {isOpen ? (
          <View style={styles.treeItemsWrap}>
            {visibleCombos.map((combo) => (
              <View key={`tree-combo-${combo.id}`} style={styles.treeRow}>
                <TouchableOpacity
                  style={styles.treeRowLeft}
                  onPress={() =>
                    router.push({
                      pathname: "/menu/combos/[id]",
                      params: { id: String(combo.id) },
                    } as any)
                  }
                  activeOpacity={0.8}
                >
                  <Text style={styles.treeItemName} numberOfLines={1}>
                    {combo.combo_name}
                  </Text>
                  {getComboOosLabel(combo, comboDetails.get(combo.id) ?? null, itemById) ? (
                    <Text style={styles.treeOosSubtext} numberOfLines={2}>
                      {getComboOosLabel(combo, comboDetails.get(combo.id) ?? null, itemById)}
                    </Text>
                  ) : (
                    <Text style={styles.treeInStockSubtext} numberOfLines={1}>
                      In stock
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={styles.treeRowRight}>
                  <Text style={styles.treePrice}>₹{Number(combo.combo_price).toFixed(0)}</Text>
                  <CatalogStockToggle
                    value={effectiveComboInStock(combo, comboDetails.get(combo.id) ?? null, itemById)}
                    onValueChange={(v) => handleToggleComboStock(combo, v)}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderComboCards = () =>
    visibleCombos.map((combo) => {
      const detail = comboDetails.get(combo.id) ?? null;
      const hasUnavailableItem =
        detail?.components?.some((c) => {
          const item = itemById.get(c.menu_item_id);
          return item && !effectiveInStock(item);
        }) ?? false;

      return (
        <ComboCard
          key={`combo-${combo.id}`}
          combo={combo}
          detail={detail}
          itemById={itemById}
          isDisabled={hasUnavailableItem}
          effectiveComboInStock={effectiveComboInStock}
          onToggleComboStock={handleToggleComboStock}
          onMoreOptions={() => handleComboOptions(combo)}
          onPress={() =>
            router.push({
              pathname: "/menu/combos/[id]",
              params: { id: String(combo.id) },
            } as any)
          }
        />
      );
    });

  const catalogListEmpty =
    kindFilter === "COMBOS"
      ? combosReady && visibleCombos.length === 0
      : kindFilter === "ADDONS"
        ? !catalogPending && custScopeRows.length === 0
        : !catalogPending && items.length === 0 && (kindFilter === "ITEMS" || (combosReady && combos.length === 0));

  if (!canFetch) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>
          {!selectedStore ? "Select a store" : "Sign in to manage menu"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {itemAction != null && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.actionOverlay}>
            <View style={styles.actionLoaderCard}>
              <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
              <Text style={styles.actionLoaderText}>
                {itemAction.type === "delete" ? "Deleting item…" : "Submitting request…"}
              </Text>
            </View>
          </View>
        </Modal>
      )}
    <ScrollView
      ref={scrollRef}
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GatiMitraMerchant.primary} />
      }
    >
      {/* Top bar: add + search + filter icon — compact row */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.addBtn, GatiMitraMerchant.cursorPointer]}
          onPress={() => setAddMenuVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={GatiMitraMerchant.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor={GatiMitraMerchant.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
          {(search?.length ?? 0) > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={GatiMitraMerchant.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

          {kindFilter !== "ADDONS" ? (
            <View style={styles.viewToggleWrap}>
              <TouchableOpacity
                style={[
                  styles.viewToggleBtn,
                  viewMode === "card" && styles.viewToggleBtnActive,
                ]}
                onPress={() => setViewMode("card")}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="grid-outline"
                  size={18}
                  color={viewMode === "card" ? "#fff" : GatiMitraMerchant.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.viewToggleBtn,
                  styles.viewToggleBtnRight,
                  viewMode === "tree" && styles.viewToggleBtnActive,
                ]}
                onPress={() => setViewMode("tree")}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="list-outline"
                  size={18}
                  color={viewMode === "tree" ? "#fff" : GatiMitraMerchant.textSecondary}
                />
              </TouchableOpacity>
            </View>
          ) : null}

        <TouchableOpacity
          style={[styles.filterIconBtn, hasActiveCatalogFilters && styles.filterIconBtnActive]}
          onPress={() => setFilterSheetVisible(true)}
          activeOpacity={0.85}
          hitSlop={8}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={hasActiveCatalogFilters ? GatiMitraMerchant.primary : GatiMitraMerchant.textSecondary}
          />
          {hasActiveCatalogFilters ? <View style={styles.filterIconDot} /> : null}
        </TouchableOpacity>
      </View>

      {/* Add menu: what to add + view existing */}
      <Modal visible={addMenuVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setAddMenuVisible(false)}>
          <View style={styles.addMenuCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.addMenuTitle}>What do you want to add?</Text>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/categories" as any); }} activeOpacity={0.7}>
              <Ionicons name="folder-open-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Category</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/categories?addSubcategory=1" as any); }} activeOpacity={0.7}>
              <Ionicons name="git-branch-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Subcategory</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/combos" as any); }} activeOpacity={0.7}>
              <Ionicons name="layers-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Combo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={handleAddItem} activeOpacity={0.7}>
              <Ionicons name="restaurant-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Menu item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/addon-library" as any); }} activeOpacity={0.7}>
              <Ionicons name="pricetag-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Addon group</Text>
            </TouchableOpacity>
            <View style={styles.addMenuDivider} />
            <Text style={styles.addMenuSubtitle}>View or manage existing</Text>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/categories" as any); }} activeOpacity={0.7}>
              <Ionicons name="list-outline" size={22} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.addMenuOptionText}>Categories & subcategories</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/combos" as any); }} activeOpacity={0.7}>
              <Ionicons name="layers-outline" size={22} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.addMenuOptionText}>Combos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/addon-library" as any); }} activeOpacity={0.7}>
              <Ionicons name="pricetag-outline" size={22} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.addMenuOptionText}>Addon Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuCancel} onPress={() => setAddMenuVisible(false)}>
              <Text style={styles.addMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        {lockedItemsCount > 0 ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText} numberOfLines={2}>
              {lockedItemsUpgradeMessage(lockedItemsCount)}
            </Text>
          </View>
        ) : null}
        {showCatalogKindToggle ? (
          <CatalogKindToggle
            active={catalogKindTab}
            allCount={catalogAllCount}
            comboCount={catalogComboCount}
            addonsCount={catalogAddonsCount}
            onChange={handleCatalogKindChange}
          />
        ) : (
          <Text style={styles.sectionTitle}>
            {kindFilter === "ADDONS"
              ? `Add-ons · ${custScopeRows.length}`
              : effectiveCategoryId != null
                ? (categoryMap.get(effectiveCategoryId) ?? "Items") + ` · ${totalDisplayed}`
                : `All items & combos · ${totalDisplayed}`}
          </Text>
        )}
        {kindFilter === "ADDONS" ? (
          <CatalogCustItemsPanel
            items={allItems}
            detailsById={custDetailsById}
            storeId={storeId!}
            token={token!}
            categoryNameById={categoryDisplayNameById}
            searchQuery={searchDebounced}
            onOpenItem={handleOpenItemDetails}
            onDetailsChange={handleCustDetailsChange}
          />
        ) : (
          <>
            {loading && allItems.length === 0 ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
                <Text style={styles.emptyText}>Loading menu…</Text>
              </View>
            ) : (
              <>
                <View style={styles.itemGrid}>
              {showItems ? (
                <View style={styles.treeWrap}>
                  {itemsTreeGroups.map((group) => {
                    const isOpen = openTreeGroups[group.key] ?? true;
                    const allInStock =
                      (group.items?.length ?? 0) > 0 &&
                      group.items.every((i) => effectiveInStock(i));
                    const totalItemsInGroup = group.items?.length ?? 0;
                    const outOfStockInGroup = group.items.filter((i) => !effectiveInStock(i)).length;
                    const categoryIdNum = /^\d+$/.test(group.key) ? parseInt(group.key, 10) : NaN;

                    return (
                      <View
                        key={group.key}
                        style={[
                          styles.treeGroupCard,
                          !allInStock && styles.treeGroupCardOos,
                        ]}
                        onLayout={(e) => {
                          const y = e.nativeEvent.layout.y;
                          setSectionOffsets((prev) => (prev[group.key] === y ? prev : { ...prev, [group.key]: y }));
                        }}
                      >
                        <CatalogCategoryHeader
                          title={group.categoryName}
                          count={totalItemsInGroup}
                          isOpen={isOpen}
                          allInStock={allInStock}
                          outOfStockCount={outOfStockInGroup}
                          onToggleOpen={() =>
                            setOpenTreeGroups((prev) => ({
                              ...prev,
                              [group.key]: !isOpen,
                            }))
                          }
                          onToggleStock={() => {
                            void handleCategoryGroupStockToggle(group, categoryIdNum, allInStock);
                          }}
                          onMenuPress={() => {
                            openCategoryMenu(group, categoryIdNum);
                          }}
                        />

                        {isOpen ? (
                          <View style={styles.treeItemsWrap}>
                            {group.items.map((item) => {
                              if (viewMode === "card") {
                                return (
                                  <MenuItemCard
                                    key={item.id}
                                    item={item}
                                    onToggleEffectiveStock={handleToggleEffectiveStock}
                                    onToggleRecommended={handleToggleRecommended}
                                    effectiveInStock={effectiveInStock}
                                    getItemOosLabel={getItemOosLabel}
                                    onMoreOptions={handleMoreOptions}
                                    onOpenPreview={handleOpenItemPreview}
                                    onOpenPhoto={handleOpenItemPhoto}
                                    photoUpload={photoUploadByItemId[item.id] ?? null}
                                  />
                                );
                              }

                              const treeLocked = isMenuItemPlanLocked(item);
                              return (
                                <View key={item.id} style={[styles.treeRow, treeLocked && styles.treeRowLocked]}>
                                  <TouchableOpacity
                                    style={styles.treeRowLeft}
                                    onPress={() => {
                                      if (treeLocked) {
                                        Alert.alert("Item locked", lockedItemTapMessage());
                                        return;
                                      }
                                      handleOpenItemDetails(item.id);
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <View style={styles.treeThumbWrap}>
                                      {item.item_image_url ? (
                                        <AuthProxyImage
                                          uri={item.item_image_url}
                                          token={token}
                                          style={StyleSheet.absoluteFillObject}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <View style={styles.treeThumbPlaceholder}>
                                          <Ionicons
                                            name="image-outline"
                                            size={16}
                                            color={GatiMitraMerchant.textTertiary}
                                          />
                                        </View>
                                      )}
                                    </View>
                                    <View style={styles.treeRowTextCol}>
                                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 }}>
                                        <Text
                                          style={[styles.treeItemName, treeLocked && styles.treeItemNameLocked]}
                                          numberOfLines={1}
                                        >
                                          {item.item_name}
                                        </Text>
                                        {treeLocked ? (
                                          <View style={styles.treeLockedPill}>
                                            <Text style={styles.treeLockedPillText}>Locked</Text>
                                          </View>
                                        ) : null}
                                      </View>
                                      {treeLocked ? (
                                        <Text style={styles.treeOosSubtext} numberOfLines={1}>
                                          Locked — upgrade your current plan to unlock
                                        </Text>
                                      ) : getItemOosLabel(item) ? (
                                        <Text style={styles.treeOosSubtext} numberOfLines={2}>
                                          {getItemOosLabel(item)}
                                        </Text>
                                      ) : (
                                        <Text style={styles.treeInStockSubtext} numberOfLines={1}>
                                          In stock
                                        </Text>
                                      )}
                                    </View>
                                  </TouchableOpacity>
                                  <View style={styles.treeRowRight}>
                                    <Text style={styles.treePrice}>
                                      ₹{Number(item.base_price ?? item.selling_price).toFixed(0)}
                                    </Text>
                                    <CatalogStockToggle
                                      value={effectiveInStock(item)}
                                      onValueChange={(v) => handleToggleEffectiveStock(item, v)}
                                      disabled={treeLocked}
                                    />
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  {viewMode === "tree" ? renderComboTreeSection() : null}
                </View>
              ) : null}
              {showCombos && kindFilter === "COMBOS" && viewMode === "tree" ? (
                <View style={styles.treeWrap}>{renderComboTreeSection()}</View>
              ) : null}
              {showCombos && viewMode === "card" ? renderComboCards() : null}
                </View>
                {catalogListEmpty ? (
                  <View style={styles.emptyCard}>
                    <Ionicons
                      name={kindFilter === "COMBOS" ? "layers-outline" : "restaurant-outline"}
                      size={36}
                      color={GatiMitraMerchant.textTertiary}
                    />
                    <Text style={styles.emptyText}>
                      {kindFilter === "COMBOS"
                        ? "No combos yet. Add one from the Add menu."
                        : search.trim()
                          ? "No items match your search"
                          : "No items match. Add an item or change filters."}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>

      {/* Main catalog filters bottom sheet */}
      <Modal visible={filterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, styles.filterSheetMain, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.filterSheetHeaderRow}>
              <Text style={styles.filterSheetTitle}>Filters</Text>
              {hasActiveCatalogFilters ? (
                <TouchableOpacity onPress={clearCatalogFilters} hitSlop={8}>
                  <Text style={styles.filterSheetClearText}>Clear all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.filterSectionInSheet}>
                <View style={styles.filterRow}>
                  <View style={[styles.filterTriggerWrap, (subcategoriesOfSelected?.length ?? 0) > 0 ? styles.filterTriggerHalf : undefined]}>
                    <Text style={styles.filterLabel}>Category</Text>
                    <TouchableOpacity
                      style={styles.filterCategoryTrigger}
                      onPress={() => setCategoryFilterSheetVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="folder-open-outline" size={14} color={GatiMitraMerchant.primary} />
                      <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>{selectedCategoryLabel}</Text>
                      <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {(subcategoriesOfSelected?.length ?? 0) > 0 ? (
                    <View style={styles.filterTriggerHalf}>
                      <Text style={styles.filterLabel}>Subcategory</Text>
                      <TouchableOpacity
                        style={styles.filterCategoryTrigger}
                        onPress={() => setSubcategoryFilterSheetVisible(true)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="git-branch-outline" size={14} color={GatiMitraMerchant.primary} />
                        <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>{selectedSubcategoryLabel}</Text>
                        <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
                <View style={styles.filterRow}>
                  <View style={styles.filterTriggerThird}>
                    <Text style={styles.filterLabel}>Status</Text>
                    <TouchableOpacity
                      style={styles.filterCategoryTrigger}
                      onPress={() => setStatusFilterSheetVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>
                        {approvalFilter === "ALL" ? "All" : approvalFilter === "PENDING" ? "Pending" : approvalFilter === "APPROVED" ? "Approved" : "Rejected"}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.filterTriggerThird}>
                    <Text style={styles.filterLabel}>Stock</Text>
                    <TouchableOpacity
                      style={styles.filterCategoryTrigger}
                      onPress={() => setStockFilterSheetVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>
                        {stockFilter === "ALL" ? "All" : stockFilter === "IN_STOCK" ? "In stock" : "Out of stock"}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.filterTriggerThird}>
                    <Text style={styles.filterLabel}>Change</Text>
                    <TouchableOpacity
                      style={styles.filterCategoryTrigger}
                      onPress={() => setChangeRequestFilterSheetVisible(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>
                        {changeRequestFilter === "ALL" ? "All" : changeRequestFilter === "DELETE" ? "Delete requested" : "Edit requested"}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.filterChipsRow}>
                  <Text style={styles.filterChipLabel}>Show</Text>
                  {(["ALL", "ITEMS", "COMBOS", "ADDONS"] as ItemKindFilter[]).map((k) => (
                    <TouchableOpacity
                      key={k}
                      style={[styles.filterChip, kindFilter === k && styles.filterChipActive]}
                      onPress={() => setKindFilter(k)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.filterChipText, kindFilter === k && styles.filterChipTextActive]}>
                        {k === "ALL" ? "Items & combos" : k === "ITEMS" ? "Items only" : k === "COMBOS" ? "Combos only" : "Addons"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Status filter sheet */}
      <Modal visible={statusFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setStatusFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by status</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              {(["ALL", "PENDING", "APPROVED", "REJECTED"] as ApprovalFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterSheetItem, approvalFilter === f && styles.filterSheetItemActive]}
                  onPress={() => { setApprovalFilter(f); setStatusFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, approvalFilter === f && styles.filterSheetItemTextActive]}>
                    {f === "ALL" ? "All" : f === "PENDING" ? "Pending" : f === "APPROVED" ? "Approved" : "Rejected"}
                  </Text>
                  {approvalFilter === f && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setStatusFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Stock filter sheet */}
      <Modal visible={stockFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setStockFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by stock</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              {(["ALL", "IN_STOCK", "OUT_OF_STOCK"] as StockFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterSheetItem, stockFilter === f && styles.filterSheetItemActive]}
                  onPress={() => { setStockFilter(f); setStockFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, stockFilter === f && styles.filterSheetItemTextActive]}>
                    {f === "ALL" ? "All" : f === "IN_STOCK" ? "In stock" : "Out of stock"}
                  </Text>
                  {stockFilter === f && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setStockFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change request filter sheet */}
      <Modal visible={changeRequestFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setChangeRequestFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by change request</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              {(["ALL", "DELETE", "UPDATE"] as ChangeRequestFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterSheetItem, changeRequestFilter === f && styles.filterSheetItemActive]}
                  onPress={() => { setChangeRequestFilter(f); setChangeRequestFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, changeRequestFilter === f && styles.filterSheetItemTextActive]}>
                    {f === "ALL" ? "All" : f === "DELETE" ? "Delete requested" : "Edit requested"}
                  </Text>
                  {changeRequestFilter === f && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setChangeRequestFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Subcategory filter sheet */}
      <Modal visible={subcategoryFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSubcategoryFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by subcategory</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.filterSheetItem, selectedSubcategoryId === null && styles.filterSheetItemActive]}
                onPress={() => { setSelectedSubcategoryId(null); setSubcategoryFilterSheetVisible(false); }}
              >
                <Text style={[styles.filterSheetItemText, selectedSubcategoryId === null && styles.filterSheetItemTextActive]}>All subcategories</Text>
                {selectedSubcategoryId === null && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
              </TouchableOpacity>
              {subcategoriesOfSelected.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.filterSheetItem, selectedSubcategoryId === c.id && styles.filterSheetItemActive]}
                  onPress={() => { setSelectedSubcategoryId(c.id); setSubcategoryFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, selectedSubcategoryId === c.id && styles.filterSheetItemTextActive]}>{c.category_name}</Text>
                  {selectedSubcategoryId === c.id && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setSubcategoryFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category filter sheet */}
      <Modal visible={categoryFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setCategoryFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by category</Text>
            <View style={styles.filterSheetSearchWrap}>
              <Ionicons name="search-outline" size={20} color={GatiMitraMerchant.textTertiary} />
              <TextInput
                style={styles.filterSheetSearchInput}
                placeholder="Search categories..."
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={categorySearch}
                onChangeText={setCategorySearch}
              />
              {(categorySearch?.length ?? 0) > 0 && (
                <TouchableOpacity onPress={() => setCategorySearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={GatiMitraMerchant.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.filterSheetItem, selectedCategoryId === null && styles.filterSheetItemActive]}
                onPress={() => { setSelectedCategoryId(null); setSelectedSubcategoryId(null); setCategoryFilterSheetVisible(false); }}
              >
                <Text style={[styles.filterSheetItemText, selectedCategoryId === null && styles.filterSheetItemTextActive]}>All categories</Text>
                {selectedCategoryId === null && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
              </TouchableOpacity>
              {filteredCategoriesForSheet.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.filterSheetItem, selectedCategoryId === c.id && styles.filterSheetItemActive]}
                  onPress={() => { setSelectedCategoryId(c.id); setSelectedSubcategoryId(null); setCategoryFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, selectedCategoryId === c.id && styles.filterSheetItemTextActive]} numberOfLines={2}>{getCategoryDisplayName(c)}</Text>
                  {selectedCategoryId === c.id && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
              {((filteredCategoriesForSheet?.length ?? 0) === 0) && (
                <Text style={styles.filterSheetEmpty}>No categories match</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setCategoryFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FAB: fixed position just above tab bar — moved slightly lower so it does not cover item toggles */}
      <TouchableOpacity
        style={[styles.fab, { bottom: TAB_BAR_SCROLL_CONTENT_PADDING }]}
        onPress={() => setManageSheetVisible(true)}
        activeOpacity={0.9}
      >
        <Ionicons name="list" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Manage sheet: existing categories & combos with edit/delete/add */}
      <Modal visible={manageSheetVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.popupOverlay}>
          <Pressable style={styles.popupBackdrop} onPress={() => setManageSheetVisible(false)} />
          <View style={styles.popupCard} onStartShouldSetResponder={() => true}>
            <View style={styles.popupHeader}>
              <Text style={styles.popupTitle}>Categories</Text>
              <TouchableOpacity onPress={() => setManageSheetVisible(false)} hitSlop={10} style={styles.popupCloseX}>
                <Ionicons name="close" size={20} color={GatiMitraMerchant.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.popupList} showsVerticalScrollIndicator={false}>
              {manageCategoryRows.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={styles.popupRow}
                  activeOpacity={0.85}
                  onPress={() => {
                    handleJumpToSection(r.key);
                  }}
                >
                  <Text style={styles.popupRowLabel} numberOfLines={1}>{r.label}</Text>
                  <View style={styles.popupRowDots} />
                  <View style={styles.popupCountPill}>
                    <Text style={styles.popupCountText}>{r.count}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.popupFooter}>
              <TouchableOpacity style={styles.popupCloseBtn} onPress={() => setManageSheetVisible(false)} activeOpacity={0.9}>
                <Text style={styles.popupCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CatalogItemEditSheet
        visible={itemPreviewSheet != null}
        item={itemPreviewSheet}
        inStock={itemPreviewSheet ? effectiveInStock(itemPreviewSheet) : false}
        oosLabel={itemPreviewSheet ? getItemOosLabel(itemPreviewSheet) : null}
        onClose={() => setItemPreviewSheet(null)}
        onUpdateStock={handlePreviewUpdateStock}
        onEditItem={handlePreviewEditItem}
      />

      <CatalogItemPhotoSheet
        visible={itemPhotoSheet != null}
        item={itemPhotoSheet}
        storeId={storeId}
        token={token}
        imageLimitReached={imagePlan?.imageLimitReached ?? false}
        onClose={() => setItemPhotoSheet(null)}
        onUpdated={() => {
          void refetchCatalog();
          if (storeId && token) {
            void fetchMenuImageUploadStatus(storeId, token).then(setImagePlan).catch(() => {});
          }
        }}
        uploadCallbacks={catalogPhotoUploadCallbacks}
        onRequestUploadOptions={() => {
          const current = itemPhotoSheet;
          if (!current) return;
          if (imagePlan?.imageLimitReached) {
            Alert.alert(
              "Limit exceeded",
              imagePlan.maxImageUploads != null
                ? `Image limit reached (${imagePlan.maxImageUploads}/${imagePlan.maxImageUploads}). Upgrade your plan to add more.`
                : "Image upload limit reached for your plan."
            );
            return;
          }
          setItemPhotoSheet(null);
          InteractionManager.runAfterInteractions(() => {
            setItemUploadSheet(current);
          });
        }}
      />

      <CatalogPhotoUploadOptionsSheet
        visible={itemUploadSheet != null}
        item={itemUploadSheet}
        storeId={storeId}
        token={token}
        imageLimitReached={imagePlan?.imageLimitReached ?? false}
        onClose={() => setItemUploadSheet(null)}
        onUploaded={() => {
          void refetchCatalog();
          if (storeId && token) {
            void fetchMenuImageUploadStatus(storeId, token).then(setImagePlan).catch(() => {});
          }
        }}
        uploadCallbacks={catalogPhotoUploadCallbacks}
      />

      <CatalogPhotoUploadToast
        visible={photoUploadToast?.visible ?? false}
        previewUri={photoUploadToast?.previewUri ?? null}
        onHide={() =>
          setPhotoUploadToast((prev) => (prev ? { ...prev, visible: false } : null))
        }
      />

      <CatalogCategoryMenuSheet
        visible={categoryMenuTarget != null}
        target={categoryMenuTarget}
        categories={categories ?? []}
        storeId={storeId}
        token={token}
        onClose={() => setCategoryMenuTarget(null)}
        onChanged={() => {
          void refetchCategories();
          void refetchCatalog();
        }}
      />

      <OutOfStockModal
        visible={oosModal != null}
        title={
          oosModal?.kind === "ITEM" && oosModal.scheduleTitle
            ? oosModal.scheduleTitle
            : oosModal?.kind === "CATEGORY"
            ? "Mark Category out of stock"
            : oosModal?.kind === "COMBO"
              ? "Mark combo out of stock"
            : "When will this be available?"
        }
        subtitle={
          oosModal?.kind === "CATEGORY"
            ? oosModal.categoryName
            : oosModal?.kind === "COMBO"
              ? oosModal.comboName
            : oosModal?.kind === "ITEM"
              ? oosModal.itemName
              : null
        }
        helperText={
          oosModal?.kind === "CATEGORY"
            ? "If you mark this category as out of stock, all items under this category will automatically be marked as out of stock. When the category is marked back in stock, all items will be restored automatically."
            : null
        }
        onClose={() => (oosBusy ? null : setOosModal(null))}
        onConfirm={handleConfirmOos}
        busy={oosBusy}
      />

      <Modal visible={restoreConfirm != null} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <Pressable style={styles.confirmBackdrop} onPress={() => setRestoreConfirm(null)} />
          <View style={styles.confirmCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.confirmTitle}>{restoreConfirm?.title ?? "Confirm"}</Text>
            <Text style={styles.confirmMessage}>{restoreConfirm?.message ?? ""}</Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnSecondary]}
                onPress={() => setRestoreConfirm(null)}
                disabled={oosBusy}
                activeOpacity={0.9}
              >
                <Text style={styles.confirmBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnPrimary]}
                onPress={() => restoreConfirm?.onConfirm?.()}
                disabled={oosBusy}
                activeOpacity={0.9}
              >
                <Text style={styles.confirmBtnPrimaryText}>Bring back in stock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: H_PADDING, paddingTop: 20 },
  centered: { justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  viewToggleWrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CATALOG_TOGGLE_RADIUS,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  viewToggleBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  viewToggleBtnRight: { borderLeftWidth: 1, borderLeftColor: GatiMitraMerchant.border },
  viewToggleBtnActive: { backgroundColor: GatiMitraMerchant.primary },
  filterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
    position: "relative",
  },
  filterIconBtnActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFDF5",
  },
  filterIconDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GatiMitraMerchant.primary,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  filterSection: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  filterSectionInSheet: {
    paddingBottom: 8,
  },
  filterRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  filterTriggerWrap: { flex: 1, minWidth: 0 },
  filterTriggerHalf: { flex: 1, minWidth: 0 },
  filterTriggerThird: { flex: 1, minWidth: 0 },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  filterCategoryTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 34,
  },
  filterCategoryTriggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  filterChipLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginRight: 4,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  filterChipActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  filterChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  filterChipTextActive: { color: "#fff" },
  filterSheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    maxHeight: "75%",
  },
  filterSheetTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 12 },
  filterSheetMain: { maxHeight: "85%" },
  filterSheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  filterSheetClearText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  filterSheetSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  filterSheetSearchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },
  filterSheetList: { maxHeight: 320 },
  filterSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  filterSheetItemActive: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  filterSheetItemText: { fontSize: 15, fontWeight: "500", color: GatiMitraMerchant.textPrimary, flex: 1 },
  filterSheetItemTextActive: { fontWeight: "700", color: GatiMitraMerchant.primary },
  filterSheetEmpty: { fontSize: 14, color: GatiMitraMerchant.textSecondary, paddingVertical: 20, textAlign: "center" },
  filterSheetDone: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 12,
    alignItems: "center",
  },
  filterSheetDoneText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  actionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  actionLoaderCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 16,
    minWidth: 200,
    ...GatiMitraMerchant.shadowSm,
  },
  actionLoaderText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  addMenuCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 20,
    padding: 24,
    ...GatiMitraMerchant.shadowSm,
  },
  addMenuTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 16 },
  addMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  addMenuOptionText: { fontSize: 16, fontWeight: "600", color: GatiMitraMerchant.textPrimary, flex: 1 },
  addMenuDivider: { height: 1, backgroundColor: GatiMitraMerchant.border, marginVertical: 12 },
  addMenuSubtitle: { fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.textTertiary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  addMenuCancel: { marginTop: 16, paddingVertical: 12, alignItems: "center" },
  addMenuCancelText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  fab: {
    position: "absolute",
    right: H_PADDING,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    ...GatiMitraMerchant.shadowSm,
  },

  // Popup (category list) style — like partnersite
  popupOverlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  popupBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  popupCard: {
    width: "86%",
    maxWidth: 420,
    maxHeight: "70%",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  popupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  popupTitle: { fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  popupCloseX: { padding: 6, borderRadius: 10, backgroundColor: GatiMitraMerchant.surfaceSubtle, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  popupList: { paddingVertical: 6 },
  popupRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  popupRowLabel: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary, maxWidth: "55%" },
  popupRowDots: {
    flex: 1,
    marginHorizontal: 10,
    height: 1,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  popupCountPill: {
    minWidth: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  popupCountText: { fontSize: 12, fontWeight: "800", color: GatiMitraMerchant.textPrimary },

  // Confirm modal (bring back in stock)
  confirmOverlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  confirmBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  confirmCard: {
    width: "86%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  confirmTitle: { fontSize: 16, fontWeight: "900", color: GatiMitraMerchant.textPrimary },
  confirmMessage: { marginTop: 8, fontSize: 13, lineHeight: 18, color: GatiMitraMerchant.textSecondary },
  confirmButtonsRow: { marginTop: 14, flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  confirmBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  confirmBtnSecondary: { backgroundColor: "#fff", borderColor: GatiMitraMerchant.border },
  confirmBtnPrimary: { backgroundColor: GatiMitraMerchant.primary, borderColor: GatiMitraMerchant.primary },
  confirmBtnSecondaryText: { fontSize: 14, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  confirmBtnPrimaryText: { fontSize: 14, fontWeight: "900", color: "#fff" },
  popupFooter: { marginTop: 10, alignItems: "flex-end" },
  popupCloseBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  popupCloseBtnText: { fontSize: 14, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    maxHeight: "70%",
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: GatiMitraMerchant.border, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 16 },
  sheetScroll: { maxHeight: 320 },
  sheetSectionLabel: { fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  sheetEmpty: { fontSize: 14, color: GatiMitraMerchant.textSecondary, marginBottom: 12 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  sheetRowExpand: { padding: 4, marginRight: 4 },
  sheetRowLabel: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary, flex: 1 },
  sheetRowActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetSubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingLeft: 28,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  sheetSubRowLabel: { fontSize: 14, color: GatiMitraMerchant.textPrimary, flex: 1 },
  sheetAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    marginTop: 4,
  },
  sheetAddRowText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.primary },
  sheetCloseBtn: { marginTop: 16, paddingVertical: 14, backgroundColor: GatiMitraMerchant.surfaceSubtle, borderRadius: 12, alignItems: "center" },
  sheetCloseBtnText: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  errorWrap: { marginBottom: 12 },
  errorText: { fontSize: 13, color: GatiMitraMerchant.error },
  section: { gap: 12 },
  catalogKindToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  catalogKindPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: CATALOG_TOGGLE_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  catalogKindPillActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primaryDark,
  },
  catalogKindPillPressed: {
    opacity: 0.92,
  },
  catalogKindLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  catalogKindLabelActive: {
    color: "#FFFFFF",
  },
  catalogKindBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: CATALOG_TOGGLE_RADIUS,
    backgroundColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
  },
  catalogKindBadgeActive: {
    backgroundColor: GatiMitraMerchant.navy,
  },
  catalogKindBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  catalogKindBadgeTextActive: {
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  loadingWrap: { paddingVertical: 40, alignItems: "center" },
  emptyCard: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: CARD_RADIUS,
    paddingVertical: 32,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  emptyCardCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: GatiMitraMerchant.primary + "18",
    borderRadius: 12,
  },
  emptyCardCtaText: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.primary },
  itemGrid: { gap: 12 },
  treeWrap: { gap: 10 },
  treeGroupCard: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    ...GatiMitraMerchant.shadowSm,
  },
  treeGroupCardOos: {
    borderLeftWidth: 3,
    borderLeftColor: GatiMitraMerchant.error,
  },
  treeGroupHeader: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  treeGroupTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 2,
    gap: 10,
  },
  treeGroupTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  treeHeaderIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  treeGroupOosRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 14,
    backgroundColor: "#F9FAFB",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    gap: 10,
  },
  treeGroupOosRowOff: {
    backgroundColor: "#FEF2F2",
  },
  treeGroupOosLeft: {
    flex: 1,
    minWidth: 0,
  },
  treeGroupOosLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: GatiMitraMerchant.textSecondary,
    letterSpacing: 0.4,
  },
  treeGroupOosLabelOff: {
    color: GatiMitraMerchant.error,
  },
  treeGroupTitleBtn: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  treeGroupTitleWrap: { flex: 1, minWidth: 0 },
  treeChevronBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  treeGroupTitle: { fontSize: 17, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  treeGroupMeta: { marginTop: 2, fontSize: 11, fontWeight: "700", color: GatiMitraMerchant.error },
  treeCountText: { fontWeight: "700", color: GatiMitraMerchant.textTertiary },
  treeGroupRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  treeInStockLabel: { fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.textSecondary },
  treeOutStockLabel: { fontSize: 12, fontWeight: "800", color: GatiMitraMerchant.error },
  treeItemsWrap: { backgroundColor: "#FFFFFF" },
  treeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  treeRowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 10,
  },
  treeThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GatiMitraMerchant.border,
  },
  treeThumbPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  treeRowTextCol: { flex: 1, minWidth: 0 },
  treeItemName: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  treeOosSubtext: { fontSize: 11, color: GatiMitraMerchant.error, fontWeight: "700", marginTop: 2 },
  treeInStockSubtext: { fontSize: 11, color: GatiMitraMerchant.success, fontWeight: "700", marginTop: 2 },
  treeRowRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  treePrice: { fontSize: 14, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  catalogItemRow: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  catalogItemRowLocked: {
    backgroundColor: "#FAFAFA",
  },
  catalogItemMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  catalogItemLeft: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  catalogItemTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  catalogItemNamePriceRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 6,
    rowGap: 2,
  },
  catalogItemName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 21,
  },
  catalogItemPriceInline: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F766E",
    letterSpacing: -0.3,
  },
  catalogItemDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: GatiMitraMerchant.textSecondary,
    marginLeft: 22,
  },
  catalogItemMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: GatiMitraMerchant.textTertiary,
    marginLeft: 22,
  },
  catalogItemImageWrap: {
    width: 88,
    height: 88,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  catalogItemImageWrapUploading: {
    borderWidth: 2,
    borderColor: "#F472B6",
    borderStyle: "dashed",
  },
  catalogItemImage: {
    width: "100%",
    height: "100%",
  },
  catalogAddPhoto: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 6,
  },
  catalogAddPhotoText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
    textAlign: "center",
  },
  catalogPhotoRejected: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "#DC2626",
    paddingVertical: 5,
    zIndex: 3,
  },
  catalogPhotoRejectedText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  catalogPhotoReviewing: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "#F59E0B",
    paddingVertical: 5,
    zIndex: 3,
  },
  catalogPhotoReviewingText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  catalogImageCountBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  catalogImageCountText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  catalogItemActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  catalogRecommendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  catalogRecommendLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  catalogRecommendLabelOn: {
    color: GatiMitraMerchant.primary,
    fontWeight: "700",
  },
  catalogStockBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  catalogStockLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  catalogStockLabelOff: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.error,
  },
  catalogOosHint: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.error,
  },
  catalogOosHintBelow: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.error,
  },
  catalogActionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  catalogIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  catalogEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
    paddingVertical: 4,
    paddingLeft: 6,
  },
  catalogEditText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  itemCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  itemCardLocked: {
    borderColor: "#fecaca",
    backgroundColor: "#fafafa",
  },
  itemImageWrapLocked: { opacity: 0.55 },
  itemImageLocked: { opacity: 0.7 },
  itemBodyLocked: { opacity: 0.85 },
  itemNameLocked: { color: GatiMitraMerchant.textSecondary },
  lockedBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#dc2626",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  lockedBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff", textTransform: "uppercase" },
  lockedSubtext: { fontSize: 11, color: "#dc2626", fontWeight: "700", marginTop: 2 },
  lockedBanner: {
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
  },
  lockedBannerText: { fontSize: 12, fontWeight: "600", color: "#92400e", lineHeight: 17 },
  treeRowLocked: { backgroundColor: "#fafafa" },
  treeItemNameLocked: { color: GatiMitraMerchant.textSecondary },
  treeLockedPill: {
    backgroundColor: "#fee2e2",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  treeLockedPillText: { fontSize: 9, fontWeight: "800", color: "#b91c1c", textTransform: "uppercase" },
  itemTouchable: { flexDirection: "row", padding: 10 },
  itemImageWrap: { position: "relative", marginRight: 10 },
  itemImage: { width: 76, height: 76, borderRadius: 12 },
  itemImagePlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  itemPriceBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.25)",
    ...GatiMitraMerchant.shadowSm,
  },
  itemPriceBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
    letterSpacing: -0.2,
  },
  comboImageStack: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    overflow: "hidden",
    position: "relative",
  },
  comboImageSingle: { width: "100%", height: "100%" },
  comboImageColumn: { flexDirection: "column", width: "100%", height: "100%" },
  comboImageColumnCell: { width: "100%", height: "50%" },
  comboImageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    height: "100%",
  },
  comboImageGridCell: {
    width: "50%",
    height: "50%",
  },
  comboBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "#0ea5e9",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  comboBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  pendingBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: GatiMitraMerchant.warning,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  rejectedBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: GatiMitraMerchant.error,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  rejectedBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  changeRequestedBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "#6366f1",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  changeRequestedBadgeText: { fontSize: 9, fontWeight: "700", color: "#fff" },
  itemBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: 1 },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  itemHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  itemDescription: { fontSize: 12, color: GatiMitraMerchant.textSecondary, lineHeight: 16 },
  itemMetaLine: { marginTop: 1 },
  oosSubtextInline: { fontSize: 11, color: GatiMitraMerchant.error, fontWeight: "700" },
  inStockSubtextInline: { fontSize: 11, color: GatiMitraMerchant.success, fontWeight: "700" },
  itemMetaTextInline: { fontSize: 11, color: GatiMitraMerchant.textSecondary },
  comboItemsList: { marginTop: 4, gap: 2 },
  comboItemLine: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  comboItemMore: { fontSize: 12, color: GatiMitraMerchant.textTertiary, fontStyle: "italic" },
  comboIncompleteHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.warning,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  sellingPrice: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.primary, letterSpacing: -0.3 },
  basePriceStrike: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textDecorationLine: "line-through" },
  comboPriceDisabled: { color: GatiMitraMerchant.textSecondary },
  comboUnavailableText: {
    fontSize: 11,
    color: GatiMitraMerchant.error,
    fontWeight: "600",
  },
  optionsSummaryText: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  optionsDetails: {
    marginTop: 4,
    padding: 6,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    gap: 4,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "flex-start",
  },
  optionsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  optionsValueColumn: {
    flex: 1,
    gap: 2,
  },
  optionsValue: {
    flex: 1,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  optionsMoreText: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    fontStyle: "italic",
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { backgroundColor: GatiMitraMerchant.surfaceWarm, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  comboCardDisabled: {
    opacity: 0.75,
  },
  addonGroupCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  addonGroupCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  addonGroupCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  addonGroupCardMeta: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  moreBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  stockToggleWrap: {},
});
