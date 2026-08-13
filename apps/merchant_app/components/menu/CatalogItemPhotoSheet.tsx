import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Modal, StyleSheet, TouchableOpacity, Pressable, Animated, ActivityIndicator, Alert, FlatList, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, InteractionManager, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, BUTTON_RADIUS, CARD_RADIUS } from "@/constants/theme";
import type { MenuItemDetail, MenuItemRow } from "@/services/menuApi";
import {
  deleteMenuItemImage,
  fetchMenuItem,
} from "@/services/menuApi";
import { AuthProxyImage, prefetchAuthImage } from "@/components/AuthProxyImage";
import {
  getCachedMenuItem,
  setCachedMenuItem,
} from "@/lib/menuItemCache";
import {
  pickCatalogPhoto,
  uploadCatalogPhotoWithProgress,
  type CatalogPhotoUploadCallbacks,
} from "@/lib/catalogPhotoUploadFlow";
import {
  MenuImageSquareAdjustModal,
  type AdjustedImageFile,
} from "@/components/menu/MenuImageSquareAdjustModal";

type Props = {
  visible: boolean;
  item: MenuItemRow | null;
  storeId: string | null;
  token: string | null;
  imageLimitReached?: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onRequestUploadOptions?: () => void;
  uploadCallbacks?: CatalogPhotoUploadCallbacks;
};

function normalizeImageModerationStatus(
  status: string | null | undefined,
): "APPROVED" | "REJECTED" | "PENDING" {
  const s = (status ?? "PENDING").trim().toUpperCase();
  if (s === "APPROVED" || s === "REJECTED") return s;
  return "PENDING";
}

function approvalMessage(
  status: MenuItemRow["approval_status"],
  hasPhotos: boolean,
): { text: string; tone: "ok" | "warn" | "bad" } | null {
  if (!hasPhotos) return null;
  if (status === "APPROVED") return { text: "This image is approved", tone: "ok" };
  if (status === "REJECTED") return null;
  return { text: "This image is in review", tone: "warn" };
}

export function CatalogItemPhotoSheet({
  visible,
  item,
  storeId,
  token,
  imageLimitReached = false,
  onClose,
  onUpdated,
  onRequestUploadOptions,
  uploadCallbacks,
}: Props) {
  const slideY = useRef(new Animated.Value(40)).current;
  const carouselRef = useRef<FlatList>(null);
  const mountedRef = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pageWidth, setPageWidth] = useState(() => Math.max(1, screenWidth - 32));
  const imageHeight = Math.min(220, pageWidth);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<MenuItemDetail | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [replaceConfirmVisible, setReplaceConfirmVisible] = useState(false);
  const [adjustUri, setAdjustUri] = useState<string | null>(null);
  const pendingReplaceItemRef = useRef<MenuItemRow | null>(null);

  const loadDetail = useCallback(async (opts?: { resetCarousel?: boolean }) => {
    if (!item || !storeId || !token) return;

    const cached = getCachedMenuItem(storeId, item.id);
    if (cached) {
      setDetail(cached);
      for (const img of cached.images ?? []) {
        void prefetchAuthImage(img.image_url, token);
      }
    } else {
      setDetailLoading(true);
    }

    try {
      const data = await fetchMenuItem(storeId, item.id, token);
      if (data) {
        setCachedMenuItem(storeId, item.id, data);
        setDetail(data);
        if (opts?.resetCarousel !== false) {
          setActiveIndex(0);
          requestAnimationFrame(() => {
            if (!mountedRef.current) return;
            carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
          });
        }
        for (const img of data.images ?? []) {
          void prefetchAuthImage(img.image_url, token);
        }
      }
    } catch (e) {
      if (!cached) {
        const msg = e instanceof Error ? e.message : "Could not load photos";
        Alert.alert("Error", msg);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [item, storeId, token]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!item) {
      setDetail(null);
      setActiveIndex(0);
      setDetailLoading(false);
      setBusy(false);
      setReplaceConfirmVisible(false);
      return;
    }
    if (!visible) {
      setReplaceConfirmVisible(false);
      return;
    }

    if (storeId && token) {
      void prefetchAuthImage(item.item_image_url, token);
      const cached = getCachedMenuItem(storeId, item.id);
      if (cached && (!detail || detail.id !== item.id)) {
        setDetail(cached);
        for (const img of cached.images ?? []) {
          void prefetchAuthImage(img.image_url, token);
        }
      }
    }

    slideY.setValue(40);
    Animated.timing(slideY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();

    if (!detail || detail.id !== item.id) {
      void loadDetail();
    }
  }, [visible, item, item?.id, detail?.id, slideY, loadDetail, storeId, token]);

  const previewImages = useMemo(
    () =>
      item?.item_image_url
        ? [
            {
              id: -1,
              image_url: item.item_image_url,
              is_primary: true,
              display_order: 0,
              moderation_status: item.primary_image_moderation_status ?? item.approval_status,
              // Match the shape of detail.images so the two arrays unify without
              // TS complaining about missing optional fields when we access
              // primaryImage.rejection_reason etc. below.
              rejection_reason: null,
              moderated_at: null,
              created_at: null,
            },
          ]
        : [],
    [item?.item_image_url, item?.primary_image_moderation_status, item?.approval_status],
  );

  const images = useMemo(() => {
    const fromDetail = detail?.images ?? [];
    // After a successful detail load with zero images, don't fall back to a
    // stale list-row primary URL (shows blank/black after delete).
    if (detail && detail.id === item?.id) {
      return [...fromDetail].sort((a, b) => {
        if (Boolean(a.is_primary) !== Boolean(b.is_primary)) return a.is_primary ? -1 : 1;
        return (a.display_order ?? 0) - (b.display_order ?? 0);
      });
    }
    if (fromDetail.length > 0) {
      return [...fromDetail].sort((a, b) => {
        if (Boolean(a.is_primary) !== Boolean(b.is_primary)) return a.is_primary ? -1 : 1;
        return (a.display_order ?? 0) - (b.display_order ?? 0);
      });
    }
    return previewImages;
  }, [detail, detail?.images, item?.id, previewImages]);
  const approvalStatus = detail?.approval_status ?? item?.approval_status ?? null;

  const currentImage = images[activeIndex] ?? null;
  const hasPhotos = images.length > 0;
  const currentModeration = currentImage
    ? normalizeImageModerationStatus(currentImage.moderation_status)
    : normalizeImageModerationStatus(approvalStatus);
  const primaryImage = images.find((img) => img.is_primary) ?? images[0] ?? null;
  const primaryModeration = primaryImage
    ? normalizeImageModerationStatus(primaryImage.moderation_status)
    : normalizeImageModerationStatus(approvalStatus);
  const status =
    primaryModeration === "REJECTED"
      ? null
      : approvalMessage(primaryModeration === "APPROVED" ? "APPROVED" : "PENDING", hasPhotos);
  const isPrimaryRejected = hasPhotos && primaryModeration === "REJECTED";
  const showAddPhotoSlide = isPrimaryRejected || approvalStatus === "REJECTED";
  const totalSlides = images.length + (showAddPhotoSlide ? 1 : 0);
  const isOnAddPhotoSlide = showAddPhotoSlide && activeIndex === images.length;
  const carouselSlides = useMemo(
    () => [
      ...images.map((img) => ({ key: `img-${img.id}-${img.image_url}`, kind: "image" as const, img })),
      ...(showAddPhotoSlide ? [{ key: "add-photo", kind: "add" as const, img: null }] : []),
    ],
    [images, showAddPhotoSlide],
  );
  const isCurrentRejected =
    activeIndex < images.length && hasPhotos && currentModeration === "REJECTED";
  const rejectionReason =
    (isCurrentRejected ? currentImage?.rejection_reason?.trim() : null) ||
    (isPrimaryRejected ? primaryImage?.rejection_reason?.trim() : null) ||
    detail?.rejection_reason?.trim() ||
    item?.rejection_reason?.trim() ||
    null;
  const showInitialLoader = detailLoading && images.length === 0 && !item?.item_image_url;

  useEffect(() => {
    if (activeIndex >= totalSlides && totalSlides > 0) {
      setActiveIndex(0);
      if (visible && mountedRef.current) {
        requestAnimationFrame(() => {
          if (!mountedRef.current || !visible) return;
          carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
        });
      }
    }
  }, [activeIndex, totalSlides, visible]);

  const handleCarouselLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - pageWidth) > 1) setPageWidth(w);
  }, [pageWidth]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = pageWidth > 0 ? pageWidth : 1;
    const idx = Math.round(e.nativeEvent.contentOffset.x / w);
    setActiveIndex((prev) => (idx !== prev && idx >= 0 && idx < totalSlides ? idx : prev));
  }, [pageWidth, totalSlides]);

  const scrollToSlide = useCallback(
    (index: number) => {
      if (!visible || !mountedRef.current) return;
      if (index < 0 || index >= totalSlides) return;
      carouselRef.current?.scrollToOffset({ offset: index * pageWidth, animated: true });
      setActiveIndex(index);
    },
    [pageWidth, totalSlides, visible],
  );

  const closeSheetForUpload = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      if (mountedRef.current) onClose();
    });
  }, [onClose]);

  const uploadAdjustedReplace = useCallback(
    async (file: AdjustedImageFile) => {
      const target = pendingReplaceItemRef.current ?? item;
      if (!target || !storeId || !token) return;
      setAdjustUri(null);
      setBusy(true);
      try {
        if (uploadCallbacks) {
          await uploadCatalogPhotoWithProgress(target, storeId, token, file, uploadCallbacks);
        } else {
          const { uploadItemImage } = await import("@/services/menuApi");
          await uploadItemImage(storeId, target.id, token, file);
        }
        onUpdated();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        Alert.alert("Could not upload photo", msg);
      } finally {
        setBusy(false);
        pendingReplaceItemRef.current = null;
      }
    },
    [item, storeId, token, uploadCallbacks, onUpdated],
  );

  const runReplacePhotoPicker = useCallback(async () => {
    if (!item || !storeId || !token || busy) return;
    try {
      pendingReplaceItemRef.current = item;
      setBusy(true);
      closeSheetForUpload();
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      await new Promise((r) => setTimeout(r, 160));
      const file = await pickCatalogPhoto("gallery");
      if (!file) {
        pendingReplaceItemRef.current = null;
        return;
      }
      await new Promise((r) => setTimeout(r, 320));
      setAdjustUri(file.uri);
    } catch (e) {
      pendingReplaceItemRef.current = null;
      const msg = e instanceof Error ? e.message : "Could not open photo";
      Alert.alert("Could not upload photo", msg);
    } finally {
      setBusy(false);
    }
  }, [item, storeId, token, busy, closeSheetForUpload]);

  const handleAddPhoto = useCallback(() => {
    if (!item || busy) return;
    if (imageLimitReached) {
      Alert.alert("Limit exceeded", "Image upload limit reached for your plan. Upgrade to add more.");
      return;
    }
    if (onRequestUploadOptions) {
      onRequestUploadOptions();
      return;
    }
    void runReplacePhotoPicker();
  }, [item, busy, imageLimitReached, onRequestUploadOptions, runReplacePhotoPicker]);

  const handleReplacePhotoPress = useCallback(() => {
    if (!item || busy) return;
    if (isOnAddPhotoSlide || isCurrentRejected || !hasPhotos) {
      handleAddPhoto();
      return;
    }
    if (primaryModeration === "APPROVED") {
      setReplaceConfirmVisible(true);
      return;
    }
    void runReplacePhotoPicker();
  }, [
    item,
    busy,
    isOnAddPhotoSlide,
    isCurrentRejected,
    hasPhotos,
    primaryModeration,
    handleAddPhoto,
    runReplacePhotoPicker,
  ]);

  const handleDeletePhoto = useCallback(async (imageToDelete: typeof images[number]) => {
    if (!imageToDelete || !storeId || !token || busy) return;
    Alert.alert("Delete photo?", "This will remove the selected image from this item.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            // Optimistic: drop the deleted slide immediately so the carousel
            // never sits on a black empty page.
            setDetail((prev) => {
              if (!prev) return prev;
              const nextImages = (prev.images ?? []).filter((img) => img.id !== imageToDelete.id);
              const next = { ...prev, images: nextImages };
              setCachedMenuItem(storeId, prev.id, next);
              return next;
            });
            setActiveIndex(0);
            requestAnimationFrame(() => {
              if (!mountedRef.current) return;
              carouselRef.current?.scrollToOffset({ offset: 0, animated: false });
            });
            await deleteMenuItemImage(storeId, imageToDelete.id, token);
            await loadDetail({ resetCarousel: true });
            onUpdated();
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Delete failed";
            Alert.alert("Could not delete photo", msg);
            await loadDetail({ resetCarousel: true });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [storeId, token, busy, loadDetail, onUpdated]);

  // While open, poll detail so admin approve/reject updates without manual refresh.
  useEffect(() => {
    if (!visible || !item || !storeId || !token) return;
    const poll = setInterval(() => {
      void loadDetail({ resetCarousel: false });
    }, 8_000);
    return () => clearInterval(poll);
  }, [visible, item?.id, storeId, token, loadDetail]);

  // Parent catalog refresh (realtime) may update moderation fields on `item`.
  useEffect(() => {
    if (!visible || !item) return;
    void loadDetail({ resetCarousel: false });
  }, [
    visible,
    item?.id,
    item?.approval_status,
    item?.primary_image_moderation_status,
    item?.item_image_url,
    item?.image_count,
  ]);

  if (!item && !adjustUri) return null;

  return (
    <>
    {item && visible ? (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideY }], paddingBottom: Math.max(insets.bottom, 20) }]}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Photo status</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.sheetBody}>
          {showInitialLoader ? (
            <View style={[styles.loadingWrap, { minHeight: imageHeight }]}>
              <ActivityIndicator color={GatiMitraMerchant.primary} />
            </View>
          ) : images.length === 0 ? (
            <View style={[styles.emptyWrap, { minHeight: imageHeight }]}>
              <Ionicons name="camera-outline" size={40} color={GatiMitraMerchant.textTertiary} />
              <Text style={styles.emptyText}>No photos uploaded yet</Text>
            </View>
          ) : (
            <View style={styles.carouselWrap} onLayout={handleCarouselLayout}>
              <FlatList
                ref={carouselRef}
                data={carouselSlides}
                keyExtractor={(slide) => slide.key}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                directionalLockEnabled
                bounces={false}
                overScrollMode="never"
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={totalSlides > 1}
                style={{ width: pageWidth }}
                getItemLayout={(_, index) => ({
                  length: pageWidth,
                  offset: pageWidth * index,
                  index,
                })}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleScroll}
                scrollEventThrottle={16}
                renderItem={({ item: slide }) => {
                  if (slide.kind === "add") {
                    return (
                      <TouchableOpacity
                        style={[styles.slide, styles.addPhotoSlide, { width: pageWidth, height: imageHeight }]}
                        onPress={handleAddPhoto}
                        disabled={busy}
                        activeOpacity={0.92}
                      >
                        <View style={styles.addPhotoInner}>
                          <View style={styles.addPhotoIconWrap}>
                            <Ionicons name="camera" size={28} color={GatiMitraMerchant.primary} />
                            <View style={styles.addPhotoPlusBadge}>
                              <Ionicons name="add" size={12} color="#FFFFFF" />
                            </View>
                          </View>
                          <Text style={styles.addPhotoSlideText}>Add photo</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }
                  const img = slide.img!;
                  const slideModeration = normalizeImageModerationStatus(img.moderation_status);
                  return (
                    <View style={[styles.slide, { width: pageWidth, height: imageHeight }]}>
                      <AuthProxyImage
                        uri={img.image_url}
                        token={token}
                        style={{ width: pageWidth, height: imageHeight, backgroundColor: "#F3F4F6" }}
                        resizeMode="contain"
                      />
                      {img.id > 0 ? (
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeletePhoto(img)}
                          disabled={busy}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                        </TouchableOpacity>
                      ) : null}
                      {slideModeration === "APPROVED" ? (
                        <View style={styles.approvedBadge}>
                          <Text style={styles.approvedBadgeText}>Approved</Text>
                        </View>
                      ) : null}
                      {slideModeration === "REJECTED" ? (
                        <View style={styles.rejectedBadge}>
                          <Ionicons name="information-circle" size={14} color="#FFFFFF" />
                          <Text style={styles.rejectedBadgeText}>Rejected</Text>
                        </View>
                      ) : slideModeration === "PENDING" ? (
                        <View style={styles.reviewingBadge}>
                          <Text style={styles.reviewingBadgeText}>Image in review</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                }}
              />

              {totalSlides > 1 ? (
                <View style={styles.pagerRow}>
                  <TouchableOpacity
                    onPress={() => scrollToSlide(activeIndex - 1)}
                    disabled={activeIndex <= 0}
                    hitSlop={10}
                    style={[styles.pagerChevronBtn, activeIndex <= 0 && styles.pagerChevronDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Previous photo"
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={activeIndex <= 0 ? "#D1D5DB" : GatiMitraMerchant.textPrimary}
                    />
                  </TouchableOpacity>
                  <View style={styles.dotsRow}>
                    {Array.from({ length: totalSlides }).map((_, idx) => (
                      <TouchableOpacity
                        key={idx === images.length ? "add-photo" : `img-${idx}`}
                        onPress={() => scrollToSlide(idx)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={idx === images.length ? "Add photo slide" : `Photo ${idx + 1}`}
                      >
                        <View style={[styles.dot, idx === activeIndex && styles.dotActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={() => scrollToSlide(activeIndex + 1)}
                    disabled={activeIndex >= totalSlides - 1}
                    hitSlop={10}
                    style={[
                      styles.pagerChevronBtn,
                      activeIndex >= totalSlides - 1 && styles.pagerChevronDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Next photo"
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={
                        activeIndex >= totalSlides - 1 ? "#D1D5DB" : GatiMitraMerchant.textPrimary
                      }
                    />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          <Text style={styles.itemNameLabel}>
            Item name: <Text style={styles.itemNameValue}>{item.item_name}</Text>
          </Text>

          {isOnAddPhotoSlide ? (
            <View style={styles.incentiveBox}>
              <Text style={styles.incentiveText}>Image increases chances of order by 60%</Text>
            </View>
          ) : isCurrentRejected ? (
            <View style={styles.rejectionReasonBox}>
              <Text style={styles.rejectionReasonLabel}>Rejection reason:</Text>
              <Text style={styles.rejectionReasonText}>
                {rejectionReason ??
                  "Photo does not meet our photo guidelines. Please upload a new photo."}
              </Text>
            </View>
          ) : status ? (
            <View
              style={[
                styles.statusBox,
                status.tone === "ok" && styles.statusBoxOk,
                status.tone === "warn" && styles.statusBoxWarn,
                status.tone === "bad" && styles.statusBoxBad,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  status.tone === "ok" && styles.statusTextOk,
                  status.tone === "warn" && styles.statusTextWarn,
                  status.tone === "bad" && styles.statusTextBad,
                ]}
              >
                {status.text}
              </Text>
            </View>
          ) : !hasPhotos ? (
            <View style={styles.noPhotoHintBox}>
              <Text style={styles.noPhotoHintText}>
                No photo yet. Add one so customers can see this item on the app.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.replaceBtn,
              (isPrimaryRejected || isOnAddPhotoSlide) && styles.replaceBtnLight,
              busy && styles.replaceBtnDisabled,
            ]}
            onPress={handleReplacePhotoPress}
            disabled={busy}
            activeOpacity={0.9}
          >
            {busy ? (
              <ActivityIndicator
                color={isPrimaryRejected || isOnAddPhotoSlide ? GatiMitraMerchant.textPrimary : "#FFFFFF"}
              />
            ) : (
              <Text
                style={[
                  styles.replaceBtnText,
                  (isPrimaryRejected || isOnAddPhotoSlide) && styles.replaceBtnTextDark,
                ]}
              >
                {isOnAddPhotoSlide || images.length === 0
                  ? "Add photo"
                  : showAddPhotoSlide
                    ? "Replace photo"
                    : "Replace photo"}
              </Text>
            )}
          </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
    ) : null}

    <Modal
      visible={visible && replaceConfirmVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setReplaceConfirmVisible(false)}
    >
      <View style={styles.replaceConfirmOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setReplaceConfirmVisible(false)}
        />
        <View style={styles.replaceConfirmCard} onStartShouldSetResponder={() => true}>
          <View style={styles.replaceConfirmIconWrap}>
            <Ionicons name="warning" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.replaceConfirmMessage}>
            This image is approved{"\n"}Do you still want to replace it?
          </Text>
          <View style={styles.replaceConfirmActions}>
            <TouchableOpacity
              style={styles.replaceConfirmActionBtn}
              onPress={() => {
                setReplaceConfirmVisible(false);
                void runReplacePhotoPicker();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.replaceConfirmContinueText}>Continue</Text>
            </TouchableOpacity>
            <View style={styles.replaceConfirmDivider} />
            <TouchableOpacity
              style={styles.replaceConfirmActionBtn}
              onPress={() => setReplaceConfirmVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.replaceConfirmKeepText}>Keep</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    <MenuImageSquareAdjustModal
      visible={Boolean(adjustUri)}
      uri={adjustUri}
      onCancel={() => {
        setAdjustUri(null);
        pendingReplaceItemRef.current = null;
      }}
      onConfirm={(file) => void uploadAdjustedReplace(file)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    maxHeight: "96%",
  },
  sheetScrollContent: {
    paddingBottom: 8,
  },
  sheetBody: {
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  carouselWrap: {
    marginBottom: 12,
    width: "100%",
    overflow: "hidden",
  },
  pagerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    gap: 8,
  },
  pagerChevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  pagerChevronDisabled: {
    opacity: 0.45,
  },
  slide: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  addPhotoSlide: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  addPhotoInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    margin: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 12,
  },
  addPhotoIconWrap: {
    position: "relative",
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoPlusBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1F2937",
  },
  addPhotoSlideText: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  incentiveBox: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  incentiveText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: "#1D4ED8",
    textAlign: "center",
  },
  deleteBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  approvedBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: GatiMitraMerchant.success,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  approvedBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  rejectedBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DC2626",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  rejectedBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  pendingBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "#F59E0B",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  pendingBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  reviewingBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "#F59E0B",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  reviewingBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  rejectionReasonBox: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    gap: 4,
  },
  rejectionReasonLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#991B1B",
  },
  rejectionReasonText: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    color: "#B91C1C",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
  },
  dotActive: {
    backgroundColor: GatiMitraMerchant.textPrimary,
    width: 8,
    height: 8,
  },
  itemNameLabel: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 10,
  },
  itemNameValue: {
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  statusBox: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  statusBoxOk: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  statusBoxWarn: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  statusBoxBad: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  statusTextOk: { color: "#047857" },
  statusTextWarn: { color: "#B45309" },
  statusTextBad: { color: "#B91C1C" },
  noPhotoHintBox: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  noPhotoHintText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: GatiMitraMerchant.textSecondary,
  },
  replaceBtn: {
    paddingVertical: 15,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.textPrimary,
    alignItems: "center",
  },
  replaceBtnLight: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  replaceBtnDisabled: {
    opacity: 0.7,
  },
  replaceBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  replaceBtnTextDark: {
    color: GatiMitraMerchant.textPrimary,
  },
  replaceConfirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  replaceConfirmCard: {
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
  replaceConfirmIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  replaceConfirmMessage: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 18,
  },
  replaceConfirmActions: {
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  replaceConfirmActionBtn: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  replaceConfirmDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.border,
  },
  replaceConfirmContinueText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563EB",
  },
  replaceConfirmKeepText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
});
