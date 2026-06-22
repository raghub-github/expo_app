/**
 * Zomato-style location bottom sheet — enable device location, pick saved address, or search manually.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useLocationStore, getDeviceLocationReadiness } from "@/store/locationStore";
import { useAddresses, ADDRESSES_QUERY_KEY, ACTIVE_LOCATION_QUERY_KEY } from "@/hooks/useAddresses";
import { addressService, type Address } from "@/services/address.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const BRAND = GatiMitraColors.splashMint;
const BRAND_SOFT = GatiMitraColors.mintSoft;
const TITLE_DARK = "#111827";
const TEXT_GRAY = "#6B7280";
const TEXT_MUTED = "#9CA3AF";
const BORDER = "#F3F4F6";
const INITIAL_SAVED_VISIBLE = 3;

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

function savedAddressIcon(saved: Address): { name: keyof typeof Ionicons.glyphMap; color: string } {
  const label = (saved.label ?? "").trim().toLowerCase();
  if (label === "current location") return { name: "locate", color: BRAND };
  if (label === "home") return { name: "home-outline", color: "#374151" };
  if (label === "work" || label === "office") return { name: "briefcase-outline", color: "#374151" };
  return { name: "location-outline", color: "#374151" };
}

export function LocationPermissionModal({ visible, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const promptLocationPermissionIfNeeded = useLocationStore((s) => s.promptLocationPermissionIfNeeded);
  const setAddressAndCoords = useLocationStore((s) => s.setAddressAndCoords);
  const { data: addresses = [], isPending: addressesPending } = useAddresses();
  const [enabling, setEnabling] = useState(false);
  const [selectingId, setSelectingId] = useState<number | null>(null);

  const visibleAddresses = useMemo(() => addresses.slice(0, INITIAL_SAVED_VISIBLE), [addresses]);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;
    const syncIfReady = async () => {
      const readiness = await getDeviceLocationReadiness();
      if (!readiness.isReady) return;
      await requestPermissionAndFetch({ forceDevice: true });
      handleDismiss();
    };
    void syncIfReady();
    const interval = setInterval(() => void syncIfReady(), 2000);
    return () => clearInterval(interval);
  }, [visible, requestPermissionAndFetch, handleDismiss]);

  const openLocationPage = useCallback(
    (focusSearch: boolean) => {
      handleDismiss();
      router.push({
        pathname: "/location",
        params: focusSearch ? { focusSearch: "1" } : {},
      });
    },
    [handleDismiss, router]
  );

  const handleEnableLocation = useCallback(async () => {
    setEnabling(true);
    try {
      const readiness = await getDeviceLocationReadiness();
      if (readiness.permissionStatus === "denied") {
        if (Platform.OS === "ios") {
          await Linking.openURL("app-settings:");
        } else {
          await Linking.openSettings();
        }
        return;
      }
      if (readiness.permissionStatus === "granted" && !readiness.servicesEnabled) {
        if (Platform.OS === "android") {
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            // User dismissed the system location dialog.
          }
        } else {
          await Linking.openURL("app-settings:");
        }
        await promptLocationPermissionIfNeeded();
        const stillVisible = useLocationStore.getState().showPermissionModal;
        if (!stillVisible) handleDismiss();
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const after = await getDeviceLocationReadiness();
        if (after.isReady) {
          await requestPermissionAndFetch({ forceDevice: true });
          handleDismiss();
        } else if (Platform.OS === "android") {
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            // ignore
          }
          await promptLocationPermissionIfNeeded();
        }
        return;
      }
      if (Platform.OS === "ios") {
        await Linking.openURL("app-settings:");
      } else {
        await Linking.openSettings();
      }
    } finally {
      setEnabling(false);
    }
  }, [handleDismiss, promptLocationPermissionIfNeeded, requestPermissionAndFetch]);

  const handleSelectAddress = useCallback(
    async (addr: Address) => {
      setSelectingId(addr.id);
      try {
        await Promise.all([
          addressService.setActiveLocation({
            latitude: addr.latitude,
            longitude: addr.longitude,
            address: addr.fullAddress,
          }),
          addressService.setAddressDefault(addr.id).catch(() => {}),
        ]);
        const primary = addr.label ?? "Address";
        setAddressAndCoords(
          { primary, secondary: addr.fullAddress.slice(0, 80), fullAddress: addr.fullAddress },
          { latitude: addr.latitude, longitude: addr.longitude },
          { source: "selected" }
        );
        await queryClient.invalidateQueries({ queryKey: ADDRESSES_QUERY_KEY });
        await queryClient.invalidateQueries({ queryKey: ACTIVE_LOCATION_QUERY_KEY });
        handleDismiss();
      } catch {
        // Keep sheet open so user can retry or search manually.
      } finally {
        setSelectingId(null);
      }
    },
    [handleDismiss, queryClient, setAddressAndCoords]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={handleDismiss}
    >
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={handleDismiss} accessibilityLabel="Close" />

        <View style={styles.dock}>
          <View style={styles.closeWrap}>
            <TouchableOpacity style={styles.floatingClose} onPress={handleDismiss} hitSlop={10} activeOpacity={0.9}>
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.locationBanner}>
              <View style={styles.locationBannerIconWrap}>
                <Ionicons name="location-outline" size={22} color={BRAND} />
                <View style={styles.locationSlash} />
              </View>
              <View style={styles.locationBannerText}>
                <Text style={styles.locationBannerTitle}>Device location not enabled</Text>
                <Text style={styles.locationBannerSub}>
                  Enable your device location for a better delivery experience
                </Text>
              </View>
              <TouchableOpacity
                style={styles.enableBtn}
                onPress={() => void handleEnableLocation()}
                disabled={enabling}
                activeOpacity={0.85}
              >
                {enabling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.enableBtnText}>Enable</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeadRow}>
              <Text style={styles.sectionTitle}>Select a saved address</Text>
              <TouchableOpacity onPress={() => openLocationPage(false)} hitSlop={8} activeOpacity={0.85}>
                <Text style={styles.seeAllLink}>See all</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.addressList}>
              {addressesPending && addresses.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <ActivityIndicator size="small" color={BRAND} />
                  <Text style={styles.emptyText}>Loading saved addresses…</Text>
                </View>
              ) : visibleAddresses.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="location-outline" size={32} color={TEXT_MUTED} />
                  <Text style={styles.emptyText}>No saved addresses yet</Text>
                  <TouchableOpacity onPress={() => openLocationPage(false)} activeOpacity={0.85}>
                    <Text style={styles.addAddressLink}>Add an address</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                visibleAddresses.map((addr, index) => {
                  const icon = savedAddressIcon(addr);
                  const isLast = index === visibleAddresses.length - 1;
                  const loading = selectingId === addr.id;
                  return (
                    <TouchableOpacity
                      key={addr.id}
                      style={[styles.addressRow, !isLast && styles.addressRowBorder]}
                      onPress={() => void handleSelectAddress(addr)}
                      disabled={loading}
                      activeOpacity={0.85}
                    >
                      <View style={styles.addressIconWrap}>
                        <Ionicons name={icon.name} size={22} color={icon.color} />
                      </View>
                      <View style={styles.addressTextWrap}>
                        <Text style={styles.addressLabel} numberOfLines={1}>
                          {addr.label ?? "Address"}
                        </Text>
                        <Text style={styles.addressLine} numberOfLines={2}>
                          {addr.fullAddress}
                        </Text>
                      </View>
                      {loading ? (
                        <ActivityIndicator size="small" color={BRAND} style={styles.addressChevron} />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} style={styles.addressChevron} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <TouchableOpacity style={styles.searchBar} onPress={() => openLocationPage(true)} activeOpacity={0.9}>
              <Ionicons name="search" size={20} color={TEXT_GRAY} />
              <Text style={styles.searchPlaceholder}>Search location manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  dock: {
    width: "100%",
  },
  closeWrap: {
    alignItems: "center",
    marginBottom: 10,
  },
  floatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 22,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 16,
  },
  locationBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND_SOFT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.18)",
  },
  locationBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  locationSlash: {
    position: "absolute",
    width: 28,
    height: 2,
    backgroundColor: BRAND,
    transform: [{ rotate: "-45deg" }],
    borderRadius: 1,
  },
  locationBannerText: {
    flex: 1,
    minWidth: 0,
  },
  locationBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 2,
  },
  locationBannerSub: {
    fontSize: 12,
    color: TEXT_GRAY,
    lineHeight: 17,
  },
  enableBtn: {
    backgroundColor: BRAND,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  enableBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sectionHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: "600",
    color: BRAND,
  },
  addressList: {
    flexShrink: 0,
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 11,
    gap: 12,
  },
  addressRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  addressIconWrap: {
    width: 28,
    paddingTop: 2,
    alignItems: "center",
  },
  addressTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  addressLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 2,
  },
  addressLine: {
    fontSize: 13,
    color: TEXT_GRAY,
    lineHeight: 18,
  },
  addressChevron: {
    marginTop: 4,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_GRAY,
    textAlign: "center",
  },
  addAddressLink: {
    fontSize: 14,
    fontWeight: "600",
    color: BRAND,
    marginTop: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FAFAFA",
  },
  searchPlaceholder: {
    fontSize: 15,
    color: TEXT_MUTED,
    flex: 1,
  },
});
