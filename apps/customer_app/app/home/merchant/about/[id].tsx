/**
 * Restaurant About / Store Information – GatiMitra layout.
 */

import React, { useCallback, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Share, Linking, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { merchantService, setStoreBookmark } from "@/services/merchant.service";
import { useStoreBookmarkMutations, useStoreBookmarks } from "@/hooks/useStoreBookmarks";
import { StoreTheme } from "@/constants/storeTheme";
import { ReportFraudMenuIssueSheet } from "@/components/store/ReportFraudMenuIssueSheet";
import { HiddenRestaurantAckModal } from "@/components/store/HiddenRestaurantAckModal";
import { useHiddenStores } from "@/lib/hiddenStores";
import { useScheduleTick } from "@/hooks/useScheduleTick";
import { buildStoreOpenStatusLabel } from "@/lib/storeOpenStatusLabel";
import { formatNextOpenTime, toTimestamp } from "@/lib/storeScheduleUi";
import {
  buildRestaurantShareMessage,
  buildRestaurantShareUrl,
} from "@/lib/restaurantShareLink";

function formatCloseLabel(nextCloseAt: string | number | null | undefined, nowMs: number): string | null {
  const ts = toTimestamp(nextCloseAt);
  if (ts == null || ts <= nowMs) return null;
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatLiveSinceYear(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const year = new Date(createdAt).getFullYear();
  if (!Number.isFinite(year)) return null;
  return `Live on GatiMitra since ${year}`;
}

function LegalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.legalRow}>
      <AppText style={styles.legalLabel}>{label}</AppText>
      <AppText style={styles.legalValue}>{value}</AppText>
    </View>
  );
}

export default function MerchantAboutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const storeId = id ?? "";
  const { bookmarkSet } = useStoreBookmarks();
  const { syncBookmark } = useStoreBookmarkMutations();
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [hideAckVisible, setHideAckVisible] = useState(false);
  const [hideAckHidden, setHideAckHidden] = useState(true);
  const { isHidden: isStoreHidden, hideStore, unhideStore } = useHiddenStores();
  const saved = Boolean(storeId) && bookmarkSet.has(storeId);

  const { data: about, isLoading: aboutLoading, error: aboutError } = useQuery({
    queryKey: ["merchant-about", storeId],
    queryFn: () => merchantService.getMerchantAbout(storeId),
    enabled: !!storeId,
  });

  const { data: merchant, isLoading: merchantLoading } = useQuery({
    queryKey: ["merchant", storeId],
    queryFn: () => merchantService.getMerchantById(storeId),
    enabled: !!storeId,
  });

  const canonicalStoreId = (merchant?.id ?? storeId).trim();
  const storeIsHidden =
    Boolean(canonicalStoreId) &&
    (isStoreHidden(canonicalStoreId) || isStoreHidden(storeId));

  const scheduleNow = useScheduleTick(true);
  const isLoading = aboutLoading || merchantLoading;

  const displayName = about?.store_display_name ?? about?.store_name ?? merchant?.name ?? "Restaurant";
  const legalName = (about?.owner_name ?? about?.legal_name ?? "").trim() || null;
  const cuisines = Array.isArray(about?.cuisine_types) ? about.cuisine_types.filter(Boolean) : merchant?.cuisines ?? [];

  const priceForOne = useMemo(() => {
    const menu = merchant?.menu ?? [];
    const prices = menu.map((m) => m.price).filter((p) => p > 0);
    if (!prices.length) return null;
    return Math.round(Math.min(...prices));
  }, [merchant?.menu]);

  const cuisineLine = useMemo(() => {
    const parts = [...cuisines.slice(0, 3)];
    if (priceForOne != null) parts.push(`₹${priceForOne} for one`);
    return parts.join(" · ");
  }, [cuisines, priceForOne]);

  const isOpen = merchant?.isOpen ?? (about?.operational_status ?? "").toLowerCase() === "open";
  const nextCloseAt = (merchant as { nextCloseAt?: string | number | null } | undefined)?.nextCloseAt ?? null;
  const nextOpenAt = (merchant as { nextOpenAt?: string | number | null } | undefined)?.nextOpenAt ?? null;

  const openStatus = useMemo(
    () =>
      buildStoreOpenStatusLabel({
        isOpen: !!isOpen,
        nextCloseAt,
        nextOpenAt,
        nowMs: scheduleNow,
      }),
    [isOpen, nextCloseAt, nextOpenAt, scheduleNow]
  );

  const closeTimeLabel = formatCloseLabel(nextCloseAt, scheduleNow);
  const liveSince = formatLiveSinceYear(about?.created_at ?? null);
  const fullAddress = about?.full_address ?? merchant?.address ?? null;
  const storePhone = about?.store_phone ?? null;

  const handleShare = useCallback(async () => {
    const slug =
      (about?.public_slug ?? merchant?.publicSlug ?? storeId).trim() || storeId;
    const url = buildRestaurantShareUrl(slug);
    const message = buildRestaurantShareMessage(displayName, url);
    try {
      await Share.share({
        message,
        url,
        title: displayName,
      });
    } catch (_) {}
  }, [about?.public_slug, displayName, merchant?.publicSlug, storeId]);

  const handleBookmark = useCallback(async () => {
    try {
      const next = !saved;
      syncBookmark(storeId, next);
      const res = await setStoreBookmark(storeId, next);
      if (res.saved !== next) syncBookmark(storeId, res.saved);
    } catch {
      syncBookmark(storeId, saved);
      Alert.alert("Sign in required", "Please log in to save restaurants to your collection.");
    }
  }, [saved, storeId, syncBookmark]);

  const handleToggleHideRestaurant = useCallback(async () => {
    const id = (merchant?.id ?? storeId).trim();
    if (!id) return;
    if (storeIsHidden) {
      await unhideStore(id);
      if (storeId && storeId !== id) await unhideStore(storeId);
      setHideAckHidden(false);
    } else {
      await hideStore(id);
      if (storeId && storeId !== id) await hideStore(storeId);
      setHideAckHidden(true);
    }
    setHideAckVisible(true);
  }, [hideStore, merchant?.id, storeId, storeIsHidden, unhideStore]);

  const handleCall = useCallback(() => {
    if (!storePhone) {
      Alert.alert("Contact", "Restaurant phone number is not available yet.");
      return;
    }
    const dialNumber = storePhone.replace(/\s/g, "");
    Alert.alert("Call restaurant", storePhone, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Call",
        onPress: () => Linking.openURL(`tel:${dialNumber}`),
      },
    ]);
  }, [storePhone]);

  const handleNavigate = useCallback(() => {
    const lat = merchant?.latitude;
    const lng = merchant?.longitude;
    if (lat != null && lng != null) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
      return;
    }
    if (fullAddress) {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`);
    }
  }, [merchant?.latitude, merchant?.longitude, fullAddress]);

  if (!storeId) {
    return (
      <View style={styles.center}>
        <AppText style={styles.errorText}>Invalid restaurant</AppText>
      </View>
    );
  }

  if (isLoading || !about) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={StoreTheme.accentMint} />
      </View>
    );
  }

  if (aboutError) {
    return (
      <View style={[styles.container, styles.center]}>
        <AppText style={styles.errorText}>Could not load restaurant info</AppText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: 4 }]}>
        <TouchableOpacity style={styles.topBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={StoreTheme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.topBtn} onPress={handleBookmark} hitSlop={10}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={22}
              color={StoreTheme.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={handleShare} hitSlop={10}>
            <Feather name="share-2" size={21} color={StoreTheme.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <AppText style={styles.storeName}>{displayName}</AppText>
          {cuisineLine ? <AppText style={styles.cuisineLine}>{cuisineLine}</AppText> : null}
          {fullAddress ? <AppText style={styles.address}>{fullAddress}</AppText> : null}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.circleAction} onPress={handleCall} activeOpacity={0.8}>
              <Ionicons name="call-outline" size={19} color={StoreTheme.accentMint} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.circleAction} onPress={handleNavigate} activeOpacity={0.8}>
              <Ionicons name="navigate-outline" size={19} color={StoreTheme.accentMint} />
            </TouchableOpacity>
          </View>

          <View style={styles.cardDivider} />

          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => setHoursExpanded((v) => !v)}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={17} color="#828282" style={styles.rowIcon} />
            <AppText style={styles.hoursText} numberOfLines={2}>
              <AppText style={isOpen ? styles.openNow : styles.closedNow}>
                {isOpen ? "Open Now" : "Closed Now"}
              </AppText>
              {isOpen && closeTimeLabel ? (
                <AppText style={styles.hoursMuted}>{` · Closes ${closeTimeLabel}`}</AppText>
              ) : !isOpen && openStatus.label && openStatus.label !== "Closed" ? (
                <AppText style={styles.hoursMuted}>{` · ${openStatus.label}`}</AppText>
              ) : null}
            </AppText>
            <Ionicons
              name={hoursExpanded ? "chevron-up" : "chevron-down"}
              size={15}
              color="#828282"
            />
          </TouchableOpacity>

          {hoursExpanded ? (
            <View style={styles.hoursExtra}>
              {merchant?.avgPreparationTimeMinutes ? (
                <AppText style={styles.hoursExtraText}>
                  Avg preparation: {merchant.avgPreparationTimeMinutes} mins
                </AppText>
              ) : null}
              {!isOpen && nextOpenAt ? (
                <AppText style={styles.hoursExtraText}>
                  {formatNextOpenTime(toTimestamp(nextOpenAt)!)}
                </AppText>
              ) : null}
            </View>
          ) : null}

          {liveSince ? (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.infoRow}>
                <Ionicons name="phone-portrait-outline" size={17} color="#828282" style={styles.rowIcon} />
                <AppText style={styles.infoRowText}>{liveSince}</AppText>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <AppText style={styles.experienceTitle}>Had a bad experience here?</AppText>
          <TouchableOpacity style={styles.infoRow} activeOpacity={0.8} onPress={() => void handleToggleHideRestaurant()}>
            <Ionicons name={storeIsHidden ? "eye-outline" : "eye-off-outline"} size={17} color="#828282" style={styles.rowIcon} />
            <AppText style={styles.infoRowText}>
              {storeIsHidden ? "Unhide this restaurant" : "Hide this restaurant"}
            </AppText>
            <Ionicons name="chevron-forward" size={15} color="#828282" />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <AppText style={styles.experienceTitle}>Report fraud or bad practices</AppText>
          <TouchableOpacity
            style={styles.infoRow}
            activeOpacity={0.8}
            onPress={() => setReportSheetVisible(true)}
          >
            <Ionicons name="alert-circle-outline" size={17} color="#828282" style={styles.rowIcon} />
            <AppText style={styles.infoRowText}>Inaccurate photos, missing items, or other issues</AppText>
            <Ionicons name="chevron-forward" size={15} color="#828282" />
          </TouchableOpacity>
        </View>

        <View style={styles.legalBlock}>
          {legalName ? (
            <LegalRow label="Legal Name" value={legalName} />
          ) : null}
          {about.gst_number ? (
            <LegalRow label="GST Number" value={about.gst_number} />
          ) : null}
          {about.fssai_number ? (
            <LegalRow label="FSSAI Lic No" value={about.fssai_number} />
          ) : null}
          <AppText style={styles.termsLine}>
            Please review the terms of service for GatiMitra{" "}
            <AppText style={styles.legalLink}>here</AppText>
          </AppText>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.backMenuBtn} onPress={() => router.back()} activeOpacity={0.92}>
          <AppText style={styles.backMenuText}>Go back to menu</AppText>
        </TouchableOpacity>
      </View>

      <ReportFraudMenuIssueSheet
        visible={reportSheetVisible}
        storeId={storeId}
        storeNumericId={merchant?.storeNumericId}
        storeName={displayName}
        onClose={() => setReportSheetVisible(false)}
      />
      <HiddenRestaurantAckModal
        visible={hideAckVisible}
        hidden={hideAckHidden}
        onDismiss={() => setHideAckVisible(false)}
      />
    </View>
  );
}

const PAGE_BG = "#EDEDED";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 15,
    color: StoreTheme.textSecondary,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: PAGE_BG,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 2,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  storeName: {
    fontSize: 21,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 5,
    lineHeight: 27,
    letterSpacing: -0.2,
  },
  cuisineLine: {
    fontSize: 13,
    color: "#696969",
    marginBottom: 14,
    lineHeight: 18,
  },
  address: {
    fontSize: 13,
    color: "#363636",
    lineHeight: 20,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
  },
  circleAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: StoreTheme.accentMint,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E8E8E8",
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowIcon: {
    width: 20,
  },
  hoursText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  openNow: {
    fontWeight: "700",
    color: StoreTheme.ratingGreen,
  },
  closedNow: {
    fontWeight: "700",
    color: StoreTheme.accentRed,
  },
  hoursMuted: {
    fontWeight: "500",
    color: "#696969",
  },
  infoRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#363636",
    lineHeight: 18,
  },
  infoTextCol: {
    flex: 1,
    gap: 3,
  },
  infoBold: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111111",
    lineHeight: 18,
  },
  infoSub: {
    fontSize: 12,
    color: "#828282",
    lineHeight: 17,
  },
  hoursExtra: {
    marginTop: 10,
    paddingLeft: 28,
    gap: 4,
  },
  hoursExtraText: {
    fontSize: 12,
    color: "#828282",
    lineHeight: 17,
  },
  experienceTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 16,
    lineHeight: 19,
  },
  legalBlock: {
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 14,
  },
  legalRow: {
    gap: 4,
  },
  legalLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  legalValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    lineHeight: 18,
  },
  termsLine: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
    marginTop: 4,
  },
  legalLink: {
    color: StoreTheme.accentMint,
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: PAGE_BG,
  },
  backMenuBtn: {
    backgroundColor: StoreTheme.accentMint,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  backMenuText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },
});
