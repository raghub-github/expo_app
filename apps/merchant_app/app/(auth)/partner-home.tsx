/**
 * Partner home — post-login store picker.
 * Exact match to partner dashboard mock (no bottom tab bar, no merchant/store IDs on this screen).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { Animated, View, StyleSheet, ScrollView, Pressable, Modal, Image, Platform, Linking, Alert, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useNotificationPermissionGate } from "@/context/NotificationPermissionGateContext";
import { resolveImageUrl } from "@/services/outletApi";
import { isMerchantAuthError } from "@/services/auth.service";
import { openPartnerRegisterStoreHandoff } from "@/lib/partnerRegisterStoreHandoff";
import {
  GatiMitraMerchant,
  H_PADDING,
  BUTTON_RADIUS,
} from "@/constants/theme";
import type { ChildStore } from "@/context/AuthContext";

const LOGO_SIZE = 72;
const STORE_CARD_WIDTH = 188;
/** Same illustration as partnersite "View store on GatiMitra" (`/gstore.png`). */
const GSTORE_IMAGE = require("../../assets/images/gstore.png");
/** Partner brand mark — circular GatiMitra emblem. */
const LOCAL_LOGO = require("../../public/onlylogo.png");
const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";

type SortMode = "recent" | "name" | "verified";

function greetingForNow(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function isOnboardingPending(store: ChildStore): boolean {
  const status = String(store.approval_status || "").toUpperCase();
  if (status === "APPROVED") return false;
  if (status === "DELISTED") return false;
  if (status === "DRAFT") return true;
  return store.current_step < store.total_steps;
}

const SUBMITTED_REVIEW_STATUSES = new Set([
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "PENDING_VERIFICATION",
]);

function isStoreUnderReview(store: ChildStore): boolean {
  const status = String(store.approval_status || "").toUpperCase();
  if (SUBMITTED_REVIEW_STATUSES.has(status) && !isOnboardingPending(store)) return true;
  return status === "UNDER_VERIFICATION" || status === "PENDING_VERIFICATION";
}

function storeInitial(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "S";
  return trimmed.charAt(0).toUpperCase();
}

/** My Stores — circular logo, ID, name, open status (horizontal scroll). */
function StoreScrollCard({
  store,
  onPress,
}: {
  store: ChildStore;
  onPress: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const pending = isOnboardingPending(store);
  const bannerUri = !pending ? resolveImageUrl(store.banner_url) : null;
  const showBanner = Boolean(bannerUri && !imageFailed);
  const delisted = String(store.approval_status || "").toUpperCase() === "DELISTED";
  const approved = String(store.approval_status || "").toUpperCase() === "APPROVED";
  const underReview = isStoreUnderReview(store);

  return (
    <Pressable
      onPress={delisted ? undefined : onPress}
      disabled={delisted}
      style={({ pressed }) => [
        styles.storeScrollCard,
        pressed && !delisted && styles.pressedSoft,
        delisted && styles.dimmed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={store.store_name?.trim() || store.store_id}
    >
      <View style={styles.storeLogoWrap}>
        <View style={styles.storeLogoCircle}>
          {pending ? (
            <LinearGradient colors={["#ECFDF5", "#A7F3D0"]} style={styles.storeLogoFill}>
              <Ionicons name="storefront-outline" size={28} color="#0D9488" />
            </LinearGradient>
          ) : showBanner ? (
            <Image
              source={{ uri: bannerUri! }}
              style={styles.storeLogoImg}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <LinearGradient colors={["#F0FDFA", "#E0F2FE"]} style={styles.storeLogoFill}>
              <Text style={styles.storeLogoInitial}>{storeInitial(store.store_name)}</Text>
            </LinearGradient>
          )}
        </View>
        {approved ? (
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <Text style={styles.storeScrollId} numberOfLines={1}>
        {store.store_id}
      </Text>
      <Text style={styles.storeScrollName} numberOfLines={3}>
        {store.store_name?.trim() || "Unnamed store"}
      </Text>

      {approved ? (
        <View style={styles.storeScrollStatus}>
          <View style={styles.storeScrollStatusRow}>
            <View style={styles.greenDot} />
            <Text style={styles.storeScrollOpen}>Open</Text>
          </View>
          <Text style={styles.storeScrollAccepting}>Accepting orders</Text>
        </View>
      ) : (
        <View style={styles.storeScrollStatus}>
          <Text style={styles.storeScrollPending}>
            {pending
              ? "Onboarding pending"
              : underReview
                ? "Under review"
                : delisted
                  ? "Delisted"
                  : "Pending"}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function PartnerHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { partner, token, supabaseUserId, signOut, isAuthenticated } = useAuth();
  const { setSelectedStore } = useSelectedStore();
  const { openPermissionGate } = useNotificationPermissionGate();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [openingPartner, setOpeningPartner] = useState(false);
  const heroAnim = useRef(new Animated.Value(0)).current;
  const bodyAnim = useRef(new Animated.Value(0)).current;

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    await signOut();
    router.replace("/(auth)/welcome");
  };

  // Prompt only when OS “Allow notifications” is off. Once on, this is a no-op.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const { readMerchantNotificationPermission } = await import(
          "@/lib/merchantNotificationPermission"
        );
        const perm = await readMerchantNotificationPermission();
        if (cancelled) return;
        if (perm.osStatus !== "granted") openPermissionGate();
      })();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [openPermissionGate]);

  const storesOrdered = useMemo(() => {
    if (!partner) return [];
    const list = [...partner.childStores];
    if (sortMode === "name") {
      return list.sort((a, b) => (a.store_name || "").localeCompare(b.store_name || ""));
    }
    if (sortMode === "verified") {
      return list.sort((a, b) => {
        const aOk = String(a.approval_status || "").toUpperCase() === "APPROVED" ? 1 : 0;
        const bOk = String(b.approval_status || "").toUpperCase() === "APPROVED" ? 1 : 0;
        if (aOk !== bOk) return bOk - aOk;
        return (a.store_name || "").localeCompare(b.store_name || "");
      });
    }
    return list.sort((a, b) => b.id - a.id);
  }, [partner, sortMode]);

  /** Single child store → skip this picker and enter that store (or continue onboarding). */
  const singleChildBypassRef = useRef(false);
  useEffect(() => {
    if (!partner || singleChildBypassRef.current) return;
    if (partner.childStores.length !== 1) return;
    const only = partner.childStores[0];
    if (!only) return;
    singleChildBypassRef.current = true;
    const approved = String(only.approval_status || "").toUpperCase() === "APPROVED";
    if (approved) {
      setSelectedStore(only);
      router.replace("/(tabs)");
      return;
    }
    // One incomplete child — same as tapping the card (partner onboarding).
    void (async () => {
      if (!isAuthenticated || !token) return;
      try {
        await openPartnerRegisterStoreHandoff({
          accessToken: token,
          parentId: partner.parent.id,
          supabaseUserId,
          storeId: only.store_id,
        });
      } catch {
        singleChildBypassRef.current = false;
      }
    })();
  }, [partner, router, setSelectedStore, isAuthenticated, token, supabaseUserId]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(bodyAnim, {
        toValue: 1,
        duration: 440,
        delay: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroAnim, bodyAnim]);

  const openPartnerOnboarding = async (storeId?: string) => {
    if (!isAuthenticated || !token || !partner) {
      Alert.alert("Login required", "Please log in to add or continue a store.");
      router.replace("/(auth)/welcome");
      return;
    }
    if (openingPartner) return;
    setOpeningPartner(true);
    try {
      await openPartnerRegisterStoreHandoff({
        accessToken: token,
        parentId: partner.parent.id,
        supabaseUserId,
        storeId,
      });
    } catch (e) {
      const message = isMerchantAuthError(e)
        ? e.message
        : e instanceof Error
          ? e.message
          : "Could not open partner portal.";
      if (isMerchantAuthError(e) && (e.code === "session_revoked" || e.code === "invalid_token")) {
        Alert.alert("Login required", message, [
          { text: "OK", onPress: () => router.replace("/(auth)/welcome") },
        ]);
      } else {
        Alert.alert("Could not open", message);
      }
    } finally {
      setOpeningPartner(false);
    }
  };

  if (!partner) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  // Avoid flashing the picker while we auto-enter the only child store.
  if (partner.childStores.length === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={GatiMitraMerchant.primary} />
        <Text style={[styles.muted, { marginTop: 12 }]}>Opening your store…</Text>
      </View>
    );
  }

  const { parent, childStores } = partner;
  const ownerName = parent.owner_name?.trim() || "Partner";
  const businessName =
    parent.brand_name?.trim() || parent.parent_name?.trim() || "Your business";
  const primaryStore = storesOrdered[0] ?? childStores[0];
  const headerStoreLine = primaryStore?.store_name?.trim() || businessName;
  const approvedCount = childStores.filter(
    (s) => String(s.approval_status || "").toUpperCase() === "APPROVED"
  ).length;
  const accountVerified = approvedCount > 0;
  const greeting = greetingForNow();
  const merchantId = parent.parent_merchant_id?.trim() || "";
  const headerLogo = LOCAL_LOGO;

  const openStore = (store: ChildStore) => {
    const approved = String(store.approval_status || "").toUpperCase() === "APPROVED";
    if (approved) {
      setSelectedStore(store);
      router.replace("/(tabs)");
      return;
    }
    void openPartnerOnboarding(store.store_id);
  };

  const openAddStore = () => {
    void openPartnerOnboarding();
  };

  const sortLabel =
    sortMode === "name" ? "Name A–Z" : sortMode === "verified" ? "Verified first" : "Recently Added";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* White/light status bar + dark icons; teal card sits below (2nd image match) */}
      <StatusBar style="dark" backgroundColor="#F4F7F8" translucent={false} />

      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLogoutModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Log out?</Text>
            <Text style={styles.modalMessage}>Are you sure you want to log out of your account?</Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnLogout]} onPress={handleLogoutConfirm}>
                <Text style={styles.modalBtnLogoutText}>Log out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={accountSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAccountSheetVisible(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setAccountSheetVisible(false)}>
          <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>Partner account</Text>
            <View style={styles.sheetRows}>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetLabel}>Merchant ID</Text>
                <Text style={styles.sheetValue}>{merchantId || "—"}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetLabel}>Business</Text>
                <Text style={styles.sheetValue}>{businessName}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetLabel}>Owner</Text>
                <Text style={styles.sheetValue}>{parent.owner_name}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetLabel}>Email</Text>
                <Text style={styles.sheetValue}>{parent.owner_email || "—"}</Text>
              </View>
              <View style={[styles.sheetRow, styles.sheetRowLast]}>
                <Text style={styles.sheetLabel}>Stores</Text>
                <Text style={styles.sheetValue}>
                  {childStores.length} store{childStores.length === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
              onPress={() => setAccountSheetVisible(false)}
            >
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <Pressable style={styles.sortOverlay} onPress={() => setSortMenuOpen(false)}>
          <View style={styles.sortMenu}>
            {(
              [
                { key: "recent", label: "Recently Added" },
                { key: "name", label: "Name A–Z" },
                { key: "verified", label: "Verified first" },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.sortOpt, sortMode === opt.key && styles.sortOptOn]}
                onPress={() => {
                  setSortMode(opt.key);
                  setSortMenuOpen(false);
                }}
              >
                <Text style={[styles.sortOptText, sortMode === opt.key && styles.sortOptTextOn]}>
                  {opt.label}
                </Text>
                {sortMode === opt.key ? (
                  <Ionicons name="checkmark" size={16} color="#0D9488" />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 16) + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: heroAnim }}>
          <View style={styles.heroShell}>
            <LinearGradient
              colors={["#0F9F8E", "#14B8A6", "#2DD4BF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.orb} />

              <View style={styles.heroTop}>
                <View style={styles.heroTextCol}>
                  <Text style={styles.greeting}>
                    {greeting},{" "}
                    <Text style={styles.greetingWave}>{"\u{1F44B}"}</Text>
                  </Text>
                  <Text style={styles.owner} numberOfLines={1}>
                    {ownerName}
                  </Text>
                  <Text style={styles.biz} numberOfLines={2} ellipsizeMode="tail">
                    {headerStoreLine}
                  </Text>
                </View>
                <View style={styles.heroIcons}>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                    onPress={() => setAccountSheetVisible(true)}
                    accessibilityLabel="Profile"
                    hitSlop={6}
                  >
                    <Ionicons name="person" size={20} color="#FFFFFF" />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                    onPress={() => setLogoutModalVisible(true)}
                    accessibilityLabel="Sign out"
                    hitSlop={6}
                  >
                    <Ionicons name="exit-outline" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>

              <View style={styles.heroBottom}>
                <View style={styles.chipRow}>
                  <View style={styles.merchantChip}>
                    <Ionicons name="shield-checkmark" size={13} color="#FFFFFF" />
                    <Text style={styles.merchantChipText} numberOfLines={1}>
                      {accountVerified ? "Verified Merchant" : "Merchant Partner"}
                    </Text>
                  </View>
                  {merchantId ? (
                    <View style={styles.parentIdChip}>
                      <Text style={styles.parentIdChipText} numberOfLines={1}>
                        {merchantId}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Logo stays inside the header card — dashed ring like mock */}
                <View style={styles.logoRing} pointerEvents="none">
                  <View style={styles.logoBubble}>
                    <Image source={headerLogo} style={styles.logoImg} resizeMode="contain" />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        <Animated.View
          style={{
            opacity: bodyAnim,
            transform: [
              {
                translateY: bodyAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          }}
        >
          {/* Combined stats card — exact mock layout */}
          <View style={styles.statsCard}>
            <View style={styles.statHalf}>
              <View style={styles.statIcon}>
                <Ionicons name="storefront-outline" size={20} color="#14B8A6" />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>Total Stores</Text>
                <Text style={styles.statValue}>{childStores.length}</Text>
                <Text style={styles.statHint}>
                  {approvedCount <= 1 ? "Active Store" : `${approvedCount} Active Stores`}
                </Text>
              </View>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statHalf}>
              <View style={styles.statIcon}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#14B8A6" />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel}>Account Status</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {accountVerified ? "Verified" : "Pending"}
                </Text>
                <Text style={styles.statHint}>
                  {accountVerified ? "Secure & Active" : "Complete setup"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>My Stores</Text>
            <Pressable
              style={({ pressed }) => [styles.sortPill, pressed && styles.pressed]}
              onPress={() => setSortMenuOpen(true)}
            >
              <Text style={styles.sortPillText}>{sortLabel}</Text>
              <Ionicons name="chevron-down" size={14} color="#64748B" />
            </Pressable>
          </View>

          {storesOrdered.length === 0 ? (
            <Text style={styles.emptyHint}>
              No store registered yet. Use Add Another Store below to get started.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storeScrollContent}
              style={styles.storeScroll}
              decelerationRate="fast"
              snapToInterval={STORE_CARD_WIDTH + 12}
              snapToAlignment="start"
            >
              {storesOrdered.map((store) => (
                <StoreScrollCard
                  key={store.store_id}
                  store={store}
                  onPress={() => openStore(store)}
                />
              ))}
            </ScrollView>
          )}

          {/* Manage banner */}
          <LinearGradient
            colors={["#E8F9F5", "#E0F7FA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.manageBanner}
          >
            <Pressable
              onPress={openAddStore}
              disabled={openingPartner}
              style={styles.managePress}
              accessibilityRole="button"
              accessibilityLabel="Manage all your stores"
            >
              <View style={styles.manageArt}>
                <Image source={GSTORE_IMAGE} style={styles.manageArtImg} resizeMode="contain" />
              </View>
              <View style={styles.manageCopy}>
                <Text style={styles.manageTitle} numberOfLines={2}>
                  Manage all your stores from one place
                </Text>
                <Text style={styles.manageSub} numberOfLines={2}>
                  Track performance, manage menu, orders & much more.
                </Text>
              </View>
              <View style={styles.manageArrow}>
                <Ionicons name="chevron-forward" size={16} color="#0D9488" />
              </View>
            </Pressable>
          </LinearGradient>

          <Pressable
            onPress={openAddStore}
            disabled={openingPartner}
            style={({ pressed }) => [styles.ctaWrap, pressed && styles.pressedSoft]}
            accessibilityRole="button"
            accessibilityLabel="Add another store"
          >
            <LinearGradient
              colors={["#0D9488", "#14B8A6", "#10B981"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              <View style={styles.ctaIcon}>
                {openingPartner ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="storefront" size={18} color="#FFFFFF" />
                    <View style={styles.ctaPlus}>
                      <Ionicons name="add" size={10} color="#0D9488" />
                    </View>
                  </>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ctaTitle}>
                  {openingPartner ? "Opening partner portal…" : "+ Add Another Store"}
                </Text>
                <Text style={styles.ctaSub}>Grow your business with GatiMitra</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F7F8" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  muted: { fontSize: 14, color: "#94A3B8", fontFamily: LORA },
  scroll: { flex: 1 },
  pressed: { opacity: 0.88 },
  pressedSoft: { opacity: 0.96, transform: [{ scale: 0.985 }] },
  dimmed: { opacity: 0.55 },

  heroShell: {
    position: "relative",
    zIndex: 2,
    marginBottom: 14,
  },
  hero: {
    marginHorizontal: 14,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F766E",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  orb: {
    position: "absolute",
    right: -24,
    top: -36,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  heroTextCol: { flex: 1, minWidth: 0, paddingRight: 4 },
  greeting: {
    fontSize: 13,
    fontFamily: LORA,
    color: "rgba(255,255,255,0.95)",
  },
  greetingWave: {
    fontSize: 14,
    fontFamily: undefined,
  },
  owner: {
    marginTop: 2,
    fontSize: 26,
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  biz: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: LORA,
    color: "rgba(255,255,255,0.92)",
    lineHeight: 17,
  },
  heroIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    marginTop: 2,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.75)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBottom: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  chipRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  merchantChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  merchantChipText: {
    fontSize: 12,
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
  },
  parentIdChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    maxWidth: 130,
  },
  parentIdChipText: {
    fontSize: 11,
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  logoRing: {
    width: LOGO_SIZE + 10,
    height: LOGO_SIZE + 10,
    borderRadius: (LOGO_SIZE + 10) / 2,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoBubble: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: { width: LOGO_SIZE - 6, height: LOGO_SIZE - 6 },
  logoFb: { fontSize: 16, fontFamily: LORA_BOLD, color: "#FFFFFF" },

  statsCard: {
    marginHorizontal: H_PADDING,
    marginTop: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  statHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statTextCol: { flex: 1, minWidth: 0 },
  statLabel: {
    fontSize: 11,
    fontFamily: LORA,
    color: "#64748B",
  },
  statValue: {
    marginTop: 1,
    fontSize: 20,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  statHint: {
    marginTop: 1,
    fontSize: 10,
    fontFamily: LORA,
    color: "#94A3B8",
  },

  sectionHead: {
    marginTop: 22,
    paddingHorizontal: H_PADDING,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  sortPillText: {
    fontSize: 12,
    fontFamily: LORA,
    color: "#64748B",
  },

  storeScroll: {
    marginTop: 12,
  },
  storeScrollContent: {
    paddingHorizontal: H_PADDING,
    gap: 12,
  },
  storeScrollCard: {
    width: STORE_CARD_WIDTH,
    backgroundColor: "transparent",
    paddingTop: 4,
    paddingHorizontal: 6,
    paddingBottom: 4,
    alignItems: "center",
  },
  storeLogoWrap: {
    width: 72,
    height: 72,
    marginBottom: 10,
  },
  storeLogoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "#14B8A6",
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
  },
  storeLogoFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  storeLogoImg: { width: "100%", height: "100%" },
  storeLogoInitial: {
    fontSize: 26,
    fontFamily: LORA_BOLD,
    color: "#1E3A5F",
    opacity: 0.35,
  },
  verifiedBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  storeScrollId: {
    fontSize: 11,
    fontFamily: LORA,
    color: "#94A3B8",
    marginBottom: 4,
    textAlign: "center",
    width: "100%",
  },
  storeScrollName: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    lineHeight: 19,
    minHeight: 57,
    textAlign: "center",
    width: "100%",
  },
  storeScrollStatus: {
    marginTop: 10,
    alignItems: "center",
    width: "100%",
  },
  storeScrollStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  storeScrollOpen: {
    fontSize: 13,
    fontFamily: LORA_BOLD,
    color: "#16A34A",
  },
  storeScrollAccepting: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: LORA,
    color: "#94A3B8",
    textAlign: "center",
  },
  storeScrollPending: {
    fontSize: 12,
    fontFamily: LORA,
    color: "#94A3B8",
    textAlign: "center",
  },

  emptyHint: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: LORA,
    color: "#94A3B8",
    marginTop: 12,
    paddingHorizontal: H_PADDING,
    lineHeight: 19,
  },

  manageBanner: {
    marginTop: 18,
    marginHorizontal: H_PADDING,
    borderRadius: 16,
    overflow: "hidden",
  },
  managePress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  manageArt: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "transparent",
  },
  manageArtImg: {
    width: 64,
    height: 64,
  },
  manageCopy: { flex: 1, minWidth: 0 },
  manageTitle: {
    fontSize: 13,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    lineHeight: 17,
  },
  manageSub: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: LORA,
    color: "#64748B",
    lineHeight: 15,
  },
  manageArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  ctaWrap: {
    marginTop: 28,
    marginBottom: 8,
    marginHorizontal: H_PADDING,
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F766E",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ctaPlus: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTitle: { fontSize: 16, fontFamily: LORA_BOLD, color: "#FFFFFF" },
  ctaSub: { marginTop: 2, fontSize: 12, fontFamily: LORA, color: "rgba(255,255,255,0.9)" },

  sortOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.25)",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  sortMenu: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    ...GatiMitraMerchant.shadow,
  },
  sortOpt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  sortOptOn: { backgroundColor: "#F0FDFA" },
  sortOptText: { fontSize: 14, fontFamily: LORA, color: "#0F172A" },
  sortOptTextOn: { color: "#0D9488", fontFamily: LORA_BOLD },

  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,6,23,0.42)",
  },
  sheetCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  sheetGrabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#CBD5E1",
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    marginBottom: 12,
  },
  sheetRows: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },
  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 10,
  },
  sheetRowLast: { borderBottomWidth: 0 },
  sheetLabel: { fontSize: 13, color: "#64748B", fontFamily: LORA },
  sheetValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#0F172A",
    fontFamily: LORA_BOLD,
  },
  sheetClose: {
    marginTop: 14,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  sheetCloseText: { color: "#FFFFFF", fontSize: 14, fontFamily: LORA_BOLD },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    ...GatiMitraMerchant.shadow,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: LORA,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
  },
  modalBtnCancel: { backgroundColor: "#F1F5F9" },
  modalBtnLogout: { backgroundColor: GatiMitraMerchant.error },
  modalBtnCancelText: { fontSize: 16, fontFamily: LORA_BOLD, color: "#0F172A" },
  modalBtnLogoutText: { fontSize: 16, fontFamily: LORA_BOLD, color: "#fff" },
});
