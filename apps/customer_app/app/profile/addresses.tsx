/**
 * Saved addresses – list from API, delete, set default, add new.
 * Card UI matches the Select Location saved-address design.
 */

import { useLayoutEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addressService, type Address } from "@/services/address.service";
import { useAddresses } from "@/hooks/useAddresses";
import { shareAddressViaLink } from "@/services/addressShare.service";
import { SavedAddressLocationCard } from "@/components/address/SavedAddressLocationCard";
import { AddressOptionsBottomSheet } from "@/components/address/AddressOptionsBottomSheet";
import { useLocationStore } from "@/store/locationStore";
import { distanceMeters } from "@/lib/addressGeo";

const TEAL = "#14b8a6";
const MINT_SOFT = "#ccfbf1";
const TITLE_DARK = "#0f172a";
const TEXT_GRAY = "#64748b";
const TEXT_MUTED = "#94a3b8";
const CARD_BG = "#FFFFFF";
const BORDER_LIGHT = "#f1f5f9";
const SURFACE = "#f8fafc";

const SHADOW_SOFT = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 2,
};

const PAD_H = 20;
const CARD_RADIUS = 16;

export default function AddressesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const coords = useLocationStore((s) => s.coords);
  const params = useLocalSearchParams<{ forCheckout?: string }>();
  const selectingForCheckout = params.forCheckout === "1" || params.forCheckout === "true";
  const [selectingAddressId, setSelectingAddressId] = useState<number | null>(null);
  const [optionsAddress, setOptionsAddress] = useState<Address | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: selectingForCheckout
        ? t("addresses.deliverToTitle", "Deliver to")
        : t("addresses.screenTitle", "Saved addresses"),
    });
  }, [navigation, selectingForCheckout, t]);

  const { data: addresses = [], isLoading, error } = useAddresses();

  const referenceCoords = useMemo(() => {
    if (coords?.latitude != null && coords?.longitude != null) {
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
    return null;
  }, [coords?.latitude, coords?.longitude]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => addressService.deleteAddress(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      await queryClient.invalidateQueries({ queryKey: ["active-location"] });
      const { applyActiveLocationFromBackend } = await import(
        "@/lib/applyActiveLocationFromBackend"
      );
      await applyActiveLocationFromBackend(queryClient);
      const { promptCartIfLocationBrokeServiceability } = await import(
        "@/lib/promptCartIfLocationBrokeServiceability"
      );
      void promptCartIfLocationBrokeServiceability(queryClient);
    },
  });

  const handleAddNewAddress = () =>
    router.push(
      selectingForCheckout ? { pathname: "/location", params: { afterSaveReturn: "checkout" } } : "/location"
    );

  const openEditAddress = (addr: Address) => {
    router.push({
      pathname: "/location-address",
      params: {
        latitude: String(addr.latitude),
        longitude: String(addr.longitude),
        addressId: String(addr.id),
        primary: addr.label ?? addr.fullAddress.slice(0, 40),
        ...(selectingForCheckout ? { afterSaveReturn: "checkout" as const } : {}),
      },
    });
  };

  const handleSelectForCheckout = async (addr: Address) => {
    if (selectingAddressId != null) return;
    setSelectingAddressId(addr.id);
    try {
      const { applySelectedDeliveryAddress } = await import(
        "@/lib/applySelectedDeliveryAddress"
      );
      await applySelectedDeliveryAddress(addr, queryClient);
      router.back();
    } catch {
      Alert.alert(
        t("addresses.checkoutSelectErrorTitle", "Could not update address"),
        t("addresses.checkoutSelectErrorBody", "Please try again.")
      );
    } finally {
      setSelectingAddressId(null);
    }
  };

  const handleShare = async (addr: Address) => {
    try {
      await shareAddressViaLink(addr);
    } catch {
      Alert.alert("Share failed", "Could not create address link. Please try again.");
    }
  };

  const handleDelete = (addr: Address) => {
    Alert.alert(
      t("addresses.deleteTitle", "Delete address?"),
      t("addresses.deleteMessage", "Remove this saved address?"),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        {
          text: t("common.delete", "Delete"),
          style: "destructive",
          onPress: () => deleteMutation.mutate(addr.id),
        },
      ]
    );
  };

  const hasAddresses = addresses.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && addresses.length === 0 ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator size="small" color={TEAL} />
            <AppText style={[styles.emptySub, { marginTop: 12 }]}>
              {t("addresses.loading", "Loading addresses...")}
            </AppText>
          </View>
        ) : error && addresses.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="warning-outline" size={48} color={TEXT_MUTED} />
            </View>
            <AppText style={styles.emptyTitle}>
              {t("addresses.errorLoading", "Could not load addresses")}
            </AppText>
            <AppText style={styles.emptySub}>
              {t("addresses.errorLoadingSub", "Please try again later.")}
            </AppText>
          </View>
        ) : !hasAddresses ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="location-outline" size={48} color={TEXT_MUTED} />
            </View>
            <AppText style={styles.emptyTitle}>
              {t("addresses.noSavedAddresses", "No saved address found")}
            </AppText>
            <AppText style={styles.emptySub}>
              {t(
                "addresses.noSavedAddressesSub",
                "Please use the Add new address button below for a smooth delivery experience."
              )}
            </AppText>
          </View>
        ) : (
          <>
            {selectingForCheckout ? (
              <AppText style={styles.checkoutHint}>
                {t("addresses.tapToDeliverHere", "Tap an address to deliver your order here")}
              </AppText>
            ) : null}
            {addresses.map((addr) => {
              const distM =
                referenceCoords != null
                  ? distanceMeters(
                      referenceCoords.latitude,
                      referenceCoords.longitude,
                      addr.latitude,
                      addr.longitude
                    )
                  : null;
              const isSelected = addr.isDefault || addr.isSelected === true;

              return (
                <SavedAddressLocationCard
                  key={addr.id}
                  address={addr}
                  distanceM={distM}
                  liveCoords={coords}
                  isSelected={isSelected}
                  selectedPillLabel={
                    addr.isDefault
                      ? t("addresses.default", "Default").toUpperCase()
                      : "SELECTED"
                  }
                  loading={selectingAddressId === addr.id}
                  disabled={selectingAddressId != null}
                  hideActions={selectingForCheckout}
                  onPress={
                    selectingForCheckout
                      ? () => void handleSelectForCheckout(addr)
                      : () => openEditAddress(addr)
                  }
                  onOptions={selectingForCheckout ? undefined : () => setOptionsAddress(addr)}
                  onShare={selectingForCheckout ? undefined : () => void handleShare(addr)}
                  onCamera={selectingForCheckout ? undefined : () => openEditAddress(addr)}
                />
              );
            })}
          </>
        )}

        <TouchableOpacity
          style={[styles.addCard, SHADOW_SOFT, { marginTop: hasAddresses ? 8 : 24 }]}
          activeOpacity={0.85}
          onPress={handleAddNewAddress}
        >
          <View style={styles.addIconWrap}>
            <Ionicons name="add" size={28} color={TEAL} />
          </View>
          <View style={styles.addTextWrap}>
            <AppText style={styles.addTitle}>{t("addresses.addNewAddress")}</AppText>
            <AppText style={styles.addSub}>{t("addresses.addNewAddressSub")}</AppText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={TEXT_MUTED} />
        </TouchableOpacity>
      </ScrollView>

      <AddressOptionsBottomSheet
        visible={optionsAddress != null}
        onClose={() => setOptionsAddress(null)}
        onEdit={() => {
          const addr = optionsAddress;
          setOptionsAddress(null);
          if (addr) openEditAddress(addr);
        }}
        onDelete={() => {
          const addr = optionsAddress;
          setOptionsAddress(null);
          if (addr) handleDelete(addr);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD_H,
    paddingTop: 16,
  },
  checkoutHint: {
    fontSize: 14,
    color: TEXT_GRAY,
    lineHeight: 20,
    marginBottom: 14,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: BORDER_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    color: TEXT_GRAY,
    textAlign: "center",
    lineHeight: 22,
  },
  addCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 18,
    marginTop: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#14b8a640",
  },
  addIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: MINT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  addTextWrap: { flex: 1 },
  addTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
    marginBottom: 2,
  },
  addSub: {
    fontSize: 13,
    color: TEXT_GRAY,
  },
});
