/**
 * Parcel / Courier booking entry screen — GatiMitra mint hero + pickup/drop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useLocationStore } from "@/store/locationStore";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { profileService } from "@/services/profile.service";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import { ParcelGuidelinesBottomSheet } from "./ParcelGuidelinesBottomSheet";
import { ParcelProhibitedItemsBottomSheet } from "./ParcelProhibitedItemsBottomSheet";
import { useParcelBookingStore } from "./parcelBookingStore";

const HERO_MINT = GatiMitraColors.mintSoft;

function nearCoords(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  meters = 80
): boolean {
  const dLat = (a.latitude - b.latitude) * 111_320;
  const dLng =
    (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLng) <= meters;
}

export function ParcelBookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [prohibitedOpen, setProhibitedOpen] = useState(false);
  const pickupSeededRef = useRef(false);

  const pickup = useParcelBookingStore((s) => s.pickup);
  const drop = useParcelBookingStore((s) => s.drop);
  const setPickup = useParcelBookingStore((s) => s.setPickup);
  const swapStops = useParcelBookingStore((s) => s.swapStops);
  const guidelinesShown = useParcelBookingStore((s) => s.guidelinesShown);
  const markGuidelinesShown = useParcelBookingStore((s) => s.markGuidelinesShown);
  const visitedInnerPage = useParcelBookingStore((s) => s.visitedInnerPage);
  const markVisitedInnerPage = useParcelBookingStore((s) => s.markVisitedInnerPage);

  const { data: profile } = useQuery({
    queryKey: ["me", "profile", "parcel"],
    queryFn: () => profileService.getProfile(),
    staleTime: 60_000,
  });

  // Status bar strip = same mint as hero. Don't reset on blur so pickup/drop search stays mint.
  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(HERO_MINT, "dark");
    }, [setStatusBarBackground])
  );

  // Seed pickup once only — never again after Switch clears pickup.
  useEffect(() => {
    if (pickupSeededRef.current || pickup || !address || !coords) return;
    pickupSeededRef.current = true;
    setPickup({
      primary: address.primary?.trim() || "Current location",
      fullAddress:
        address.fullAddress?.trim() ||
        [address.primary, address.city, address.state].filter(Boolean).join(", ") ||
        "Current location",
      latitude: coords.latitude,
      longitude: coords.longitude,
      contactName: profile?.full_name ?? null,
      contactMobile: profile?.mobile_number ?? null,
    });
  }, [pickup, address, coords, setPickup, profile?.full_name, profile?.mobile_number]);

  // Show guidelines once per booking session — not again after location search return.
  useEffect(() => {
    if (guidelinesShown) return;
    setGuidelinesOpen(true);
    markGuidelinesShown();
  }, [guidelinesShown, markGuidelinesShown]);

  useEffect(() => {
    const { coords: c, requestPermissionAndFetch } = useLocationStore.getState();
    if (!c) {
      void requestPermissionAndFetch({ forceDevice: false }).catch(() => undefined);
    }
  }, []);

  // Only show store pickup — no silent fallback (keeps blank slot blank after Switch).
  const pickupLine = pickup?.fullAddress?.trim() || null;

  const pickupIsCurrentLocation = useMemo(() => {
    if (!pickup || !coords) return false;
    return nearCoords(
      { latitude: pickup.latitude, longitude: pickup.longitude },
      { latitude: coords.latitude, longitude: coords.longitude }
    );
  }, [pickup, coords]);

  const contactLine = useMemo(() => {
    if (!pickup) return null;
    const name =
      pickup.contactName?.trim() || profile?.full_name?.trim() || "You";
    const phoneRaw = (
      pickup.contactMobile ||
      profile?.mobile_number ||
      ""
    ).replace(/\D/g, "");
    const phone = phoneRaw.slice(-10);
    return phone ? `${name} (${phone})` : name;
  }, [pickup, profile?.full_name, profile?.mobile_number]);

  const dropLine = drop?.fullAddress?.trim() || null;

  const bikeImg = resolveRideImage("bike");
  const autoImg = resolveRideImage("auto");

  const openSearch = (field: "pickup" | "drop") => {
    setGuidelinesOpen(false);
    router.push({
      pathname: "/home/service/parcel-location",
      params: { field },
    } as never);
  };

  const openInnerPage = useCallback(() => {
    if (!pickup || !drop) return;
    setGuidelinesOpen(false);
    markVisitedInnerPage();
    router.push("/home/service/parcel-book" as never);
  }, [pickup, drop, markVisitedInnerPage, router]);

  const openTerms = () => router.push("/profile/legal/terms-of-service" as never);

  const showContinue = !!(pickup && drop && visitedInnerPage);
  const dropContactLine = useMemo(() => {
    if (!drop) return null;
    const name = drop.contactName?.trim() || profile?.full_name?.trim() || "You";
    const phoneRaw = (drop.contactMobile || profile?.mobile_number || "").replace(/\D/g, "");
    const phone = phoneRaw.slice(-10);
    return phone ? `${name} (${phone})` : name;
  }, [drop, profile?.full_name, profile?.mobile_number]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" backgroundColor={HERO_MINT} />
      {/* Root layout already paints status-bar spacer — only a tight top pad here. */}
      <View style={styles.hero}>
        <View style={styles.topRow}>
          <AppText style={styles.eyebrow}>Send Anything. Anytime. Anywhere</AppText>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.motionLines}>
            <View style={[styles.motionLine, { width: 28 }]} />
            <View style={[styles.motionLine, { width: 20 }]} />
            <View style={[styles.motionLine, { width: 12 }]} />
          </View>
          <AppText style={styles.heroTitle}>COURIER</AppText>
        </View>

        <View style={styles.heroArt}>
          {bikeImg ? (
            <Image source={bikeImg} style={styles.heroSideImg} resizeMode="contain" />
          ) : null}
          <AppAssetImage
            assetKey={CX.home.serviceParcel}
            style={styles.heroImg}
            contentFit="contain"
          />
          {autoImg ? (
            <Image source={autoImg} style={styles.heroSideImg} resizeMode="contain" />
          ) : null}
        </View>
        <View style={styles.heroWave} />
      </View>

      <View style={styles.body}>
        <View style={styles.cardWrap}>
          <View style={styles.stopsCard}>
            <StopBlock
              kind="pickup"
              addressLine={pickupLine}
              contactLine={contactLine}
              isCurrentLocation={pickupIsCurrentLocation}
              onPress={() => openSearch("pickup")}
            />

            <View style={styles.dividerRow}>
              <View style={styles.dashedLine} />
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={swapStops}
                activeOpacity={0.85}
              >
                <Ionicons name="swap-vertical" size={16} color={GatiMitraColors.deepMintStart} />
                <AppText style={styles.switchText}>Switch</AppText>
              </TouchableOpacity>
            </View>

            <StopBlock
              kind="drop"
              addressLine={dropLine}
              contactLine={dropLine ? dropContactLine : null}
              onPress={() => openSearch("drop")}
            />
          </View>
        </View>

        <View style={styles.flexGrow} />

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          {showContinue ? (
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={openInnerPage}
              activeOpacity={0.9}
            >
              <AppText style={styles.continueBtnText}>Continue</AppText>
            </TouchableOpacity>
          ) : null}
          <AppText style={styles.footerLine}>
            Read about{" "}
            <AppText style={styles.footerLink} onPress={() => setProhibitedOpen(true)}>
              prohibited items
            </AppText>
          </AppText>
          <AppText style={styles.footerLine}>
            By continuing, you agree to our{" "}
            <AppText style={styles.footerLink} onPress={openTerms}>
              T&Cs
            </AppText>
          </AppText>
        </View>
      </View>

      <ParcelGuidelinesBottomSheet
        visible={guidelinesOpen}
        onClose={() => setGuidelinesOpen(false)}
      />
      <ParcelProhibitedItemsBottomSheet
        visible={prohibitedOpen}
        onClose={() => setProhibitedOpen(false)}
      />
    </View>
  );
}

function StopBlock({
  kind,
  addressLine,
  contactLine,
  isCurrentLocation,
  onPress,
}: {
  kind: "pickup" | "drop";
  addressLine: string | null;
  contactLine?: string | null;
  isCurrentLocation?: boolean;
  onPress: () => void;
}) {
  const isPickup = kind === "pickup";
  const title = isPickup
    ? addressLine
      ? isCurrentLocation
        ? "Pickup from current location"
        : "Pickup from"
      : "Pickup from"
    : "Drop to";
  const placeholder = isPickup ? "Search pickup address" : "Search drop address";

  return (
    <Pressable style={styles.block} onPress={onPress}>
      <View style={[styles.pin, isPickup ? styles.pinPickup : styles.pinDrop]}>
        <Ionicons
          name={isPickup ? "location" : "radio-button-on"}
          size={18}
          color={isPickup ? GatiMitraColors.primaryMint : "#EF4444"}
        />
      </View>
      <View style={styles.blockBody}>
        <AppText style={styles.blockTitle}>{title}</AppText>
        {addressLine ? (
          <>
            <AppText style={styles.addressLine} numberOfLines={3}>
              {addressLine}
            </AppText>
            {contactLine ? (
              <AppText style={styles.contactText} numberOfLines={1}>
                {contactLine}
              </AppText>
            ) : null}
          </>
        ) : (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#64748B" />
            <AppText style={styles.searchPlaceholder}>{placeholder}</AppText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  hero: {
    backgroundColor: HERO_MINT,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 14,
    overflow: "hidden",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 22,
  },
  eyebrow: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 0,
    paddingHorizontal: 4,
  },
  motionLines: {
    gap: 5,
    marginTop: 6,
  },
  motionLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.deepMintStart,
  },
  heroTitle: {
    fontSize: 40,
    fontWeight: "900",
    fontStyle: "italic",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: 0.5,
  },
  heroArt: {
    height: 148,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
  },
  heroImg: {
    width: 168,
    height: 148,
  },
  heroSideImg: {
    width: 72,
    height: 72,
    marginBottom: 10,
  },
  heroWave: {
    position: "absolute",
    left: -40,
    right: -40,
    bottom: -28,
    height: 56,
    borderRadius: 56,
    backgroundColor: GatiMitraColors.softBackground,
  },
  body: {
    flex: 1,
  },
  cardWrap: {
    marginTop: -4,
    paddingHorizontal: 16,
  },
  stopsCard: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  block: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  pinPickup: {
    backgroundColor: GatiMitraColors.mintSoft,
  },
  pinDrop: {
    backgroundColor: "#FEE2E2",
  },
  blockBody: {
    flex: 1,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
  },
  addressLine: {
    marginTop: 4,
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 18,
  },
  contactText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  dividerRow: {
    position: "relative",
    height: 28,
    justifyContent: "center",
    marginVertical: 2,
  },
  dashedLine: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    marginLeft: 48,
    marginRight: 72,
  },
  switchBtn: {
    position: "absolute",
    right: 8,
    top: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: GatiMitraColors.mintHighlight,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  switchText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  searchBox: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: GatiMitraColors.splashMint,
    backgroundColor: "#F0FDFA",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: "#94A3B8",
    fontWeight: "500",
  },
  flexGrow: {
    flex: 1,
  },
  footer: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  footerLine: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
  },
  footerLink: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
  },
  continueBtn: {
    marginBottom: 12,
    alignSelf: "stretch",
    backgroundColor: GatiMitraColors.deepMintStart,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
