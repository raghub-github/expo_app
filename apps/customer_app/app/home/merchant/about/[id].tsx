/**
 * Restaurant About / Store Information – GatiMitra layout.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Linking,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { merchantService, checkStoreBookmark, setStoreBookmark } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { useScheduleTick } from "@/hooks/useScheduleTick";
import { buildStoreOpenStatusLabel } from "@/lib/storeOpenStatusLabel";
import { formatNextOpenTime, toTimestamp } from "@/lib/storeScheduleUi";

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
      <Text style={styles.legalLabel}>{label}</Text>
      <Text style={styles.legalValue}>{value}</Text>
    </View>
  );
}

export default function MerchantAboutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const storeId = id ?? "";
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    checkStoreBookmark(storeId).then(setSaved).catch(() => {});
  }, [storeId]);

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

  const scheduleNow = useScheduleTick(true);
  const isLoading = aboutLoading || merchantLoading;

  const displayName = about?.store_display_name ?? about?.store_name ?? merchant?.name ?? "Restaurant";
  const legalName = displayName;
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
  const isCloudKitchen = about?.is_cloud_kitchen === true;

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `${displayName}${fullAddress ? `\n${fullAddress}` : ""} – order on GatiMitra`,
        title: displayName,
      });
    } catch (_) {}
  }, [displayName, fullAddress]);

  const handleBookmark = useCallback(async () => {
    try {
      const next = !saved;
      const res = await setStoreBookmark(storeId, next);
      setSaved(res.saved);
    } catch {
      Alert.alert("Sign in required", "Please log in to save restaurants to your collection.");
    }
  }, [saved, storeId]);

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
        <Text style={styles.errorText}>Invalid restaurant</Text>
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
        <Text style={styles.errorText}>Could not load restaurant info</Text>
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
          <Text style={styles.storeName}>{displayName}</Text>
          {cuisineLine ? <Text style={styles.cuisineLine}>{cuisineLine}</Text> : null}
          {fullAddress ? <Text style={styles.address}>{fullAddress}</Text> : null}

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
            <Text style={styles.hoursText} numberOfLines={2}>
              {isOpen ? (
                <>
                  <Text style={styles.openNow}>Open now</Text>
                  {closeTimeLabel ? (
                    <Text style={styles.hoursMuted}>{` · Closes ${closeTimeLabel}`}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.hoursMuted}>{openStatus.sub ?? openStatus.label}</Text>
              )}
            </Text>
            <Ionicons
              name={hoursExpanded ? "chevron-up" : "chevron-down"}
              size={15}
              color="#828282"
            />
          </TouchableOpacity>

          {hoursExpanded ? (
            <View style={styles.hoursExtra}>
              {merchant?.avgPreparationTimeMinutes ? (
                <Text style={styles.hoursExtraText}>
                  Avg preparation: {merchant.avgPreparationTimeMinutes} mins
                </Text>
              ) : null}
              {!isOpen && nextOpenAt ? (
                <Text style={styles.hoursExtraText}>
                  {formatNextOpenTime(toTimestamp(nextOpenAt)!)}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.cardDivider} />

          <View style={styles.infoRow}>
            <Ionicons name="bicycle-outline" size={17} color="#828282" style={styles.rowIcon} />
            <View style={styles.infoTextCol}>
              <Text style={styles.infoBold}>This is a delivery-only kitchen</Text>
              <Text style={styles.infoSub}>
                {isCloudKitchen
                  ? "There are multiple brands delivering from this kitchen"
                  : "Orders are prepared fresh for doorstep delivery"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color="#828282" />
          </View>

          {liveSince ? (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.infoRow}>
                <Ionicons name="phone-portrait-outline" size={17} color="#828282" style={styles.rowIcon} />
                <Text style={styles.infoRowText}>{liveSince}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.experienceTitle}>Had a bad experience here?</Text>
          <TouchableOpacity style={styles.infoRow} activeOpacity={0.8} onPress={() => router.back()}>
            <Ionicons name="eye-off-outline" size={17} color="#828282" style={styles.rowIcon} />
            <Text style={styles.infoRowText}>Hide this restaurant</Text>
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
          <Text style={styles.termsLine}>
            Please review the terms of service for GatiMitra{" "}
            <Text style={styles.legalLink}>here</Text>
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.backMenuBtn} onPress={() => router.back()} activeOpacity={0.92}>
          <Text style={styles.backMenuText}>Go back to menu</Text>
        </TouchableOpacity>
      </View>
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
