/**
 * GatiMitra Merchant — Premium multi-layer header.
 * Layout: [Logo + Store selector] ---- [Radar] ---- [Share Restaurant]
 * Left = Identity, center-right = Live radar, far right = Share store link.
 */

import { useEffect, useRef, useState } from "react";
import { View, Image, Pressable, Text, StyleSheet, Platform, LayoutAnimation, Modal, ScrollView, Share, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, HEADER_RIGHT_EDGE, CARD_RADIUS, CARD_PADDING, BUTTON_RADIUS, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { getConfig } from "@/config/env";
import { OnlineOfflineToggle } from "@/components/OnlineOfflineToggle";
import { RadarLiveIndicator } from "@/components/RadarLiveIndicator";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import type { ChildStore } from "@/context/AuthContext";

const LOGO_SIZE = 32;
const LOGO_TO_GREETING_GAP = 8;
const RADAR_TO_BELL_GAP = 12;
const RADAR_LEFT_MARGIN = 12;
const BELL_SIZE = 23;
const DEVICES_GAP = 12;

const PAGE_TITLES: Record<string, string> = {
  index: "Dashboard",
  orders: "Orders",
  menu: "Catalog",
  earnings: "Earnings",
  profile: "Profile",
};

function MainHeader({
  compact,
  pickerVisible,
  setPickerVisible,
  onRequestSwitchStore,
}: {
  compact?: boolean;
  pickerVisible: boolean;
  setPickerVisible: (v: boolean) => void;
  onRequestSwitchStore: (store: ChildStore) => void;
}) {
  const { isOnline, scheduledClosure, manualCloseUntil, restrictionType } = useStoreStatus();
  const { selectedStore } = useSelectedStore();
  const { unreadCount } = useNotifications();
  const hasScheduledClosure =
    scheduledClosure != null ||
    restrictionType === "PERMANENT_SHUT" ||
    restrictionType === "VACATION" ||
    (manualCloseUntil != null &&
      manualCloseUntil !== "" &&
      new Date(manualCloseUntil).getTime() > Date.now());
  const { partner } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const tab = segments[segments.length - 1] ?? "index";
  const isProfileSection = segments.includes("profile");
  const pageTitle = PAGE_TITLES[String(tab)] ?? "Dashboard";
  const stores = partner?.childStores ?? [];

  useEffect(() => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);


  return (
    <View style={[styles.mainHeader, compact && styles.mainHeaderCompact]}>
      <View style={styles.mainHeaderInner}>
        <View style={styles.leftSection}>
          <Image
            source={require("../assets/onlylogo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="GatiMitra"
          />
          <Pressable
            disabled={stores.length === 0}
            onPress={() => setPickerVisible(true)}
            style={({ pressed }) => [
              styles.greetingBlock,
              pressed && stores.length > 0 && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <View style={styles.greetingRow}>
              <Text style={styles.greeting} numberOfLines={1}>
                {selectedStore?.store_name ?? "Select a store"}
              </Text>
              {stores.length > 0 && (
                <Ionicons
                  name={pickerVisible ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={GatiMitraMerchant.textSecondary}
                />
              )}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {selectedStore ? `Store ID: ${selectedStore.store_id}` : pageTitle}
            </Text>
          </Pressable>
        </View>
        <View style={styles.rightSection}>
          {isOnline && (
            <View style={styles.radarWrap}>
              <RadarLiveIndicator />
            </View>
          )}
          {isProfileSection ? (
            <Pressable
              onPress={async () => {
                const store = selectedStore;
                if (!store) return;
                const base = getConfig().storeWebBaseUrl;
                const url = `${base}/home/merchant/${store.id}`;
                const message = `${store.store_name}\n${store.full_address || ""}\n${url}`;
                try {
                  await Share.share({ url, message, title: "Share Restaurant" });
                } catch {
                  // user cancelled or share not available
                }
              }}
              style={({ pressed }) => [
                styles.bellWrap,
                pressed && styles.pressed,
                GatiMitraMerchant.cursorPointer,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Share Restaurant"
            >
              <Ionicons
                name="share-social"
                size={BELL_SIZE}
                color={GatiMitraMerchant.textPrimary}
              />
            </Pressable>
          ) : (
            <View style={styles.bellWrap}>
              <Pressable
                onPress={() => router.push("/notifications")}
                style={({ pressed }) => [
                  styles.bellPressable,
                  pressed && styles.pressed,
                  GatiMitraMerchant.cursorPointer,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons
                  name="notifications-outline"
                  size={BELL_SIZE}
                  color={GatiMitraMerchant.textPrimary}
                />
                {unreadCount > 0 ? (
                  <View style={styles.notificationCountBadge}>
                    <Text style={styles.notificationCountText}>
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Your stores</Text>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {stores.map((store) => {
                const isActive = selectedStore?.id === store.id;
                return (
                  <Pressable
                    key={store.id}
                    onPress={() => {
                      if (isActive) {
                        setPickerVisible(false);
                        return;
                      }
                      onRequestSwitchStore(store);
                    }}
                    style={({ pressed }) => [
                      styles.pickerItem,
                      isActive && styles.pickerItemActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.pickerItemTextWrap}>
                      <Text
                        style={[
                          styles.pickerItemName,
                          isActive && styles.pickerItemNameActive,
                        ]}
                        numberOfLines={1}
                      >
                        {store.store_name}
                      </Text>
                      <Text style={styles.pickerItemSub} numberOfLines={1}>
                        ID: {store.store_id}
                      </Text>
                    </View>
                    {isActive && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={GatiMitraMerchant.primary}
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => {
                setPickerVisible(false);
                router.push("/(auth)/partner-home");
              }}
              style={({ pressed }) => [
                styles.manageStoresBtn,
                pressed && styles.pressed,
                GatiMitraMerchant.cursorPointer,
              ]}
            >
              <Text style={styles.manageStoresText}>Manage all stores</Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={GatiMitraMerchant.primary}
              />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StoreStatusCard({ onToggleRequest }: { onToggleRequest: () => void }) {
  const { isOnline } = useStoreStatus();
  useEffect(() => {
    if (Platform.OS !== "web") {
      const { LayoutAnimation } = require("react-native");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);
  return (
    <View style={[styles.statusCard, isOnline ? styles.statusCardOnline : styles.statusCardOffline]}>
      <View style={styles.statusCardInner}>
        <View style={styles.statusCardLeft}>
          <Text style={styles.statusCardTitle}>Store Status</Text>
          <Text style={styles.statusCardSubtitle}>
            {isOnline ? "You are receiving orders" : "Store is closed"}
          </Text>
        </View>
        <View style={styles.statusCardRight}>
          <OnlineOfflineToggle isOnline={isOnline} onToggle={onToggleRequest} />
        </View>
      </View>
    </View>
  );
}

type WarningModalType = "store-status" | "switch-store";

export function MerchantCustomHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const segments = useSegments();
  const tab = segments[segments.length - 1] ?? "index";
  const { isOnline, toggle, scheduledClosure, manualCloseUntil } = useStoreStatus();
  const hasScheduledClosure =
    scheduledClosure != null ||
    (manualCloseUntil != null &&
      manualCloseUntil !== "" &&
      new Date(manualCloseUntil).getTime() > Date.now());
  const { setSelectedStore } = useSelectedStore();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [warningModal, setWarningModal] = useState<{
    visible: boolean;
    type: WarningModalType;
    goingOffline?: boolean;
    storeToSwitch?: ChildStore;
  }>({ visible: false, type: "store-status" });

  const isHomeScreen =
    pathname === "/" ||
    pathname === "/(tabs)" ||
    pathname === "/(tabs)/" ||
    tab === "index";
  const topPadding = Math.max(insets.top, SAFE_AREA_TOP_MIN);

  const showStoreStatusWarning = () => {
    setWarningModal({
      visible: true,
      type: "store-status",
      goingOffline: isOnline,
    });
  };

  const showSwitchStoreWarning = (store: ChildStore) => {
    setWarningModal({
      visible: true,
      type: "switch-store",
      storeToSwitch: store,
    });
  };

  const closeWarningModal = () => {
    setWarningModal((prev) => ({ ...prev, visible: false }));
  };

  const confirmWarningModal = () => {
    if (warningModal.type === "store-status") {
      const wasOpening = !warningModal.goingOffline;
      const hadClosure = hasScheduledClosure;
      closeWarningModal();
      toggle()
        .then(() => {
          if (wasOpening && hadClosure) {
            Alert.alert("Store opened", "Scheduled off cleared. Store is now open and accepting orders.");
          }
        })
        .catch(() => {});
    } else if (warningModal.type === "switch-store" && warningModal.storeToSwitch) {
      setSelectedStore(warningModal.storeToSwitch);
      setPickerVisible(false);
      router.replace("/(tabs)");
      closeWarningModal();
    } else {
      closeWarningModal();
    }
  };

  const warningMessage =
    warningModal.type === "store-status"
      ? warningModal.goingOffline
        ? "Mark store as closed? You will stop receiving new orders."
        : hasScheduledClosure
          ? "Store is in scheduled off. Clear scheduled off and open store?"
          : "Mark store as open? You will start receiving orders."
      : warningModal.storeToSwitch
        ? `Switch store? You will be managing ${warningModal.storeToSwitch.store_name}.`
        : "";

  return (
    <View style={[styles.wrapper, { paddingTop: topPadding }]}>
      <View style={[styles.mainSection, !isHomeScreen && styles.mainSectionNoCard]}>
        <MainHeader
          compact={!isHomeScreen}
          pickerVisible={pickerVisible}
          setPickerVisible={setPickerVisible}
          onRequestSwitchStore={showSwitchStoreWarning}
        />
        {isHomeScreen && <StoreStatusCard onToggleRequest={showStoreStatusWarning} />}
      </View>

      <Modal
        visible={warningModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeWarningModal}
      >
        <Pressable style={styles.warningOverlay} onPress={closeWarningModal}>
          <Pressable style={styles.warningCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.warningIconWrap}>
              <Ionicons name="warning-outline" size={28} color={GatiMitraMerchant.warning} />
            </View>
            <Text style={styles.warningTitle}>Confirm</Text>
            <Text style={styles.warningMessage}>{warningMessage}</Text>
            <View style={styles.warningActions}>
              <Pressable
                onPress={closeWarningModal}
                style={({ pressed }) => [
                  styles.warningBtn,
                  styles.warningBtnCancel,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.warningBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmWarningModal}
                style={({ pressed }) => [
                  styles.warningBtn,
                  styles.warningBtnConfirm,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.warningBtnConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function MerchantHeaderLogo() {
  return (
    <Image
      source={require("../assets/onlylogo.png")}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="GatiMitra"
    />
  );
}

/** Share Restaurant button (replaces notification icon in header). */
export function MerchantHeaderNotification({ onPress }: { onPress?: () => void }) {
  const { selectedStore } = useSelectedStore();
  const handlePress = async () => {
    if (onPress) {
      onPress();
      return;
    }
    const store = selectedStore;
    if (!store) return;
    const base = getConfig().storeWebBaseUrl;
    const url = `${base}/home/merchant/${store.id}`;
    const message = `${store.store_name}\n${store.full_address || ""}\n${url}`;
    try {
      await Share.share({ url, message, title: "Share Restaurant" });
    } catch {
      // user cancelled or share not available
    }
  };
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.bellWrap, pressed && styles.pressed, GatiMitraMerchant.cursorPointer]}
      accessibilityRole="button"
      accessibilityLabel="Share Restaurant"
    >
      <Ionicons name="share-social" size={BELL_SIZE} color={GatiMitraMerchant.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  mainSection: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  mainSectionNoCard: {
    paddingBottom: 10,
  },
  mainHeader: {
    marginBottom: 14,
  },
  mainHeaderCompact: {
    marginBottom: 0,
  },
  mainHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: HEADER_RIGHT_EDGE,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: LOGO_TO_GREETING_GAP,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: RADAR_TO_BELL_GAP,
    marginLeft: RADAR_LEFT_MARGIN,
  },
  radarWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  greetingBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  bellWrap: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  bellPressable: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },
  notificationCountBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notificationCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 96,
    paddingHorizontal: 16,
  },
  pickerCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  pickerList: {
    maxHeight: 260,
    marginBottom: 8,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
    gap: 10,
  },
  pickerItemActive: {
    backgroundColor: "#F0FDF4",
  },
  pickerItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  pickerItemNameActive: {
    color: GatiMitraMerchant.primary,
  },
  pickerItemSub: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 1,
  },
  manageStoresBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingVertical: 6,
  },
  manageStoresText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  statusCard: {
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  statusCardOnline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOnline,
  },
  statusCardOffline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOffline,
  },
  statusCardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  statusCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  statusCardSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  statusCardRight: {
    marginLeft: 12,
  },
  warningOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  warningCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  warningIconWrap: {
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  warningMessage: {
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  warningActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  warningBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  warningBtnCancel: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  warningBtnConfirm: {
    backgroundColor: GatiMitraMerchant.navy,
  },
  warningBtnCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  warningBtnConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
