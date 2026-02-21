/**
 * Saved addresses – list and add (UI ready for API).
 * Matches profile tab design: cards, teal accents, clear hierarchy.
 */

import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

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

const MOCK_ADDRESSES = [
  { id: "1", labelKey: "home", line: "123, Main St, City - 400001", icon: "home-outline" as const },
  { id: "2", labelKey: "work", line: "456, Park Ave, City - 400002", icon: "briefcase-outline" as const },
];

const PAD_H = 20;
const CARD_RADIUS = 16;

export default function AddressesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hasAddresses = MOCK_ADDRESSES.length > 0;

  const handleAddNewAddress = () => router.push("/location");

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
        {!hasAddresses ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="location-outline" size={48} color={TEXT_MUTED} />
            </View>
            <Text style={styles.emptyTitle}>{t("addresses.noSavedAddresses")}</Text>
            <Text style={styles.emptySub}>{t("addresses.noSavedAddressesSub")}</Text>
          </View>
        ) : (
          <>
            {MOCK_ADDRESSES.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={[styles.addressCard, SHADOW_SOFT]}
                activeOpacity={0.85}
              >
                <View style={styles.addressIconWrap}>
                  <Ionicons name={addr.icon} size={22} color={TEAL} />
                </View>
                <View style={styles.addressBody}>
                  <Text style={styles.addressLabel}>{t(`addresses.${addr.labelKey}`)}</Text>
                  <Text style={styles.addressLine} numberOfLines={2}>
                    {addr.line}
                  </Text>
                </View>
                <TouchableOpacity
                  hitSlop={12}
                  style={styles.editBtn}
                  onPress={() => {}}
                >
                  <Ionicons name="pencil-outline" size={20} color={TEXT_GRAY} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Add new address */}
        <TouchableOpacity
          style={[
            styles.addCard,
            SHADOW_SOFT,
            { marginTop: MOCK_ADDRESSES.length > 0 ? 8 : 24 },
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
  addressLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 14,
    color: TEXT_GRAY,
    lineHeight: 20,
  },
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
