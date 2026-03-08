/**
 * Saved addresses – list from API, delete, set default, add new.
 */

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { addressService, type Address } from "@/services/address.service";

const TEAL = "#14b8a6";
const MINT_SOFT = "#ccfbf1";
const MINT_SOFT_ALT = "#E0F2F1";
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

function addressIcon(label: string | null): "home-outline" | "briefcase-outline" | "location-outline" {
  if (!label) return "location-outline";
  const l = label.toLowerCase();
  if (l === "home") return "home-outline";
  if (l === "work") return "briefcase-outline";
  return "location-outline";
}

const PAD_H = 20;
const CARD_RADIUS = 16;

export default function AddressesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: addresses = [], isLoading, error } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => addressService.deleteAddress(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => addressService.setAddressDefault(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });

  const handleAddNewAddress = () => router.push("/location");

  const handleShare = async (addr: Address) => {
    const parts: string[] = [];
    const label = addr.label ?? t("addresses.other", "Other");
    const name = addr.contactName ? ` – ${addr.contactName}` : "";
    parts.push(`${label}${name}`);
    parts.push(addr.fullAddress);
    if (addr.contactMobile) {
      parts.push(`Mobile: ${addr.contactMobile}`);
    }
    if (addr.latitude && addr.longitude) {
      parts.push(
        `Location: https://maps.google.com/?q=${addr.latitude},${addr.longitude}`
      );
    }
    parts.push("");
    parts.push("GatiMitra – order food, rides & parcels. Download the app to order now.");
    const message = parts.join("\n");
    try {
      await Share.share({ message });
    } catch {
      // ignore
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={[styles.emptySub, { marginTop: 12 }]}>{t("addresses.loading", "Loading addresses...")}</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="warning-outline" size={48} color={TEXT_MUTED} />
            </View>
            <Text style={styles.emptyTitle}>{t("addresses.errorLoading", "Could not load addresses")}</Text>
            <Text style={styles.emptySub}>{t("addresses.errorLoadingSub", "Please try again later.")}</Text>
          </View>
        ) : !hasAddresses ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="location-outline" size={48} color={TEXT_MUTED} />
            </View>
            <Text style={styles.emptyTitle}>{t("addresses.noSavedAddresses", "No saved address found")}</Text>
            <Text style={styles.emptySub}>{t("addresses.noSavedAddressesSub", "Please use the Add new address button below for a smooth delivery experience.")}</Text>
          </View>
        ) : (
          <>
            {addresses.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={[styles.addressCard, SHADOW_SOFT]}
                activeOpacity={0.85}
              >
                <View style={styles.addressIconWrap}>
                  <Ionicons name={addressIcon(addr.label)} size={22} color={TEAL} />
                </View>
                <View style={styles.addressBody}>
                  <View style={styles.addressLabelRow}>
                    <Text style={styles.addressLabel}>{addr.label ?? t("addresses.other", "Other")}</Text>
                    {addr.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>{t("addresses.default", "Default")}</Text>
                      </View>
                    )}
                  </View>
                  {addr.contactName ? (
                    <Text style={styles.addressLine} numberOfLines={1}>
                      {addr.contactName}
                      {addr.contactMobile ? ` • ${addr.contactMobile}` : ""}
                    </Text>
                  ) : null}
                  <Text style={styles.addressLine} numberOfLines={2}>
                    {addr.fullAddress}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  {!addr.isDefault && (
                    <TouchableOpacity
                      hitSlop={12}
                      style={styles.editBtn}
                      onPress={() => setDefaultMutation.mutate(addr.id)}
                      disabled={setDefaultMutation.isPending}
                    >
                      <Text style={styles.setDefaultText}>{t("addresses.setDefault", "Set default")}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    hitSlop={12}
                    style={styles.editBtn}
                    onPress={() => handleShare(addr)}
                  >
                    <Ionicons name="share-social-outline" size={20} color={TEXT_GRAY} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    hitSlop={12}
                    style={styles.editBtn}
                    onPress={() => handleDelete(addr)}
                    disabled={deleteMutation.isPending}
                  >
                    <Ionicons name="trash-outline" size={20} color={TEXT_GRAY} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Add new address */}
        <TouchableOpacity
          style={[
            styles.addCard,
            SHADOW_SOFT,
            { marginTop: hasAddresses ? 8 : 24 },
          ]}
          activeOpacity={0.85}
          onPress={handleAddNewAddress}
        >
          <View style={styles.addIconWrap}>
            <Ionicons name="add" size={28} color={TEAL} />
          </View>
          <View style={styles.addTextWrap}>
            <Text style={styles.addTitle}>{t("addresses.addNewAddress")}</Text>
            <Text style={styles.addSub}>{t("addresses.addNewAddressSub")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={TEXT_MUTED} />
        </TouchableOpacity>
      </ScrollView>
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
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
  },
  addressIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MINT_SOFT_ALT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  addressBody: { flex: 1, marginRight: 12 },
  addressLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  addressLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
  },
  defaultBadge: {
    backgroundColor: MINT_SOFT_ALT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  defaultBadgeText: { fontSize: 11, fontWeight: "600", color: TEAL },
  addressLine: {
    fontSize: 14,
    color: TEXT_GRAY,
    lineHeight: 20,
  },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  setDefaultText: { fontSize: 12, color: TEAL, fontWeight: "600" },
  editBtn: {
    padding: 8,
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
