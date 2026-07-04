/**
 * Partner home — cover header, welcome card, collapsible partner account, profile-circle store grid (Partner Site style).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  ImageBackground,
  Image,
  Platform,
  useWindowDimensions,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { resolveImageUrl } from "@/services/outletApi";
import {
  GatiMitraMerchant,
  H_PADDING,
  BUTTON_RADIUS,
  SAFE_AREA_TOP_MIN,
} from "@/constants/theme";
import type { ChildStore } from "@/context/AuthContext";
import { MX } from "@/lib/appAssetKeys";
import { useAppAssetSource } from "@/store/appAssetsStore";

const STORE_NAME_MAX_CHARS = 28;
const CIRCLE_SIZE = 118;
const PARTNER_BASE = "https://partner.gatimitra.com";
const HERO_BODY_HEIGHT = 208;
const BANNER_OVERLAP_RATIO = 0.6;

function truncateName(name: string, max = STORE_NAME_MAX_CHARS): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function isOnboardingPending(store: ChildStore): boolean {
  const status = String(store.approval_status || "").toUpperCase();
  if (status === "APPROVED") return false;
  if (status === "DELISTED") return false;
  if (status === "DRAFT") return true;
  return store.current_step < store.total_steps;
}

const SUBMITTED_REVIEW_STATUSES = new Set(["SUBMITTED", "UNDER_VERIFICATION", "PENDING_VERIFICATION"]);

function isStoreUnderReview(store: ChildStore): boolean {
  const status = String(store.approval_status || "").toUpperCase();
  if (SUBMITTED_REVIEW_STATUSES.has(status) && !isOnboardingPending(store)) return true;
  return status === "UNDER_VERIFICATION" || status === "PENDING_VERIFICATION";
}

function getStatusBadge(store: ChildStore): { label: string; bg: string; text: string } {
  if (isOnboardingPending(store)) {
    return { label: "Pending", bg: "#22C55E", text: "#FFFFFF" };
  }
  const s = String(store.approval_status || "").toUpperCase();
  if (s === "APPROVED") return { label: "Verified", bg: "#DCFCE7", text: "#166534" };
  if (s === "REJECTED") return { label: "Rejected", bg: "#FEE2E2", text: "#991B1B" };
  if (isStoreUnderReview(store) || SUBMITTED_REVIEW_STATUSES.has(s)) {
    return { label: "Under review", bg: "#FEF3C7", text: "#92400E" };
  }
  if (s === "DELISTED") return { label: "Delisted", bg: "#E2E8F0", text: "#475569" };
  return { label: "Pending", bg: "#F1F5F9", text: "#475569" };
}

function onboardingUrl(parentId: number, storeId?: string): string {
  if (storeId) {
    return `${PARTNER_BASE}/auth/register-store?parent_id=${parentId}&store_id=${encodeURIComponent(storeId)}`;
  }
  return `${PARTNER_BASE}/auth/register-store?parent_id=${parentId}&new=1`;
}

function storeInitial(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "S";
  return trimmed.charAt(0).toUpperCase();
}

function StoreProfileCircle({
  store,
  itemWidth,
  onPress,
  animationValue,
  animationStart,
}: {
  store: ChildStore;
  itemWidth: number;
  onPress: () => void;
  animationValue: Animated.Value;
  animationStart: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const pending = isOnboardingPending(store);
  const badge = getStatusBadge(store);
  const bannerUri = !pending ? resolveImageUrl(store.banner_url) : null;
  const showBanner = Boolean(bannerUri && !imageFailed);
  const delisted = String(store.approval_status || "").toUpperCase() === "DELISTED";
  const approved = String(store.approval_status || "").toUpperCase() === "APPROVED";
  const opacity = animationValue.interpolate({
    inputRange: [animationStart, animationStart + 0.2],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const translateY = animationValue.interpolate({
    inputRange: [animationStart, animationStart + 0.2],
    outputRange: [14, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={{ width: itemWidth, opacity, transform: [{ translateY }] }}>
      <Pressable
        onPress={delisted ? undefined : onPress}
        style={({ pressed }) => [
          styles.profileItem,
          pressed && !delisted && styles.profileItemPressed,
        ]}
        disabled={delisted}
        accessibilityRole="button"
        accessibilityLabel={
          store.store_name
            ? `${store.store_name}, ${badge.label}`
            : `Store ${store.store_id}, ${badge.label}`
        }
      >
        <View style={styles.circleOuter}>
          {pending ? (
            <View style={[styles.circle, styles.circlePendingRing]}>
              <LinearGradient colors={["#ECFDF5", "#D1FAE5", "#A7F3D0"]} style={styles.circleFill}>
                <Text style={styles.pendingLetter}>P</Text>
              </LinearGradient>
              <View style={styles.leafBadge}>
                <Ionicons name="leaf" size={13} color="#FFFFFF" />
              </View>
            </View>
          ) : (
            <View style={[styles.circle, delisted && styles.circleDelisted]}>
              {showBanner ? (
                <>
                  <Image
                    source={{ uri: bannerUri! }}
                    style={styles.circleImage}
                    resizeMode="cover"
                    onError={() => setImageFailed(true)}
                  />
                  <LinearGradient
                    colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)"]}
                    style={styles.circleOverlay}
                  />
                </>
              ) : (
                <LinearGradient colors={["#F8FAFC", "#EFF6FF", "#F5F3FF"]} style={styles.circleFill}>
                  <Text style={styles.circleInitial}>{storeInitial(store.store_name)}</Text>
                </LinearGradient>
              )}
              <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusBadgeText, { color: badge.text }]} numberOfLines={1}>
                  {badge.label}
                </Text>
              </View>
            </View>
          )}
          <Text style={styles.storeIdText} numberOfLines={1}>
            {store.store_id}
          </Text>
        </View>

        <Text style={styles.storeNameText} numberOfLines={2}>
          {store.store_name?.trim() || "Unnamed store"}
        </Text>

        {approved ? (
          <Text style={styles.tapHint}>Tap to open dashboard</Text>
        ) : pending ? (
          <Pressable style={styles.completeBtn} onPress={onPress}>
            <Text style={styles.completeBtnText}>Complete onboarding</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function AddStoreCircle({
  itemWidth,
  onPress,
  animationValue,
  animationStart,
}: {
  itemWidth: number;
  onPress: () => void;
  animationValue: Animated.Value;
  animationStart: number;
}) {
  const opacity = animationValue.interpolate({
    inputRange: [animationStart, animationStart + 0.2],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const translateY = animationValue.interpolate({
    inputRange: [animationStart, animationStart + 0.2],
    outputRange: [14, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={{ width: itemWidth, opacity, transform: [{ translateY }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.profileItem, pressed && styles.profileItemPressed]}
        accessibilityRole="button"
        accessibilityLabel="Add new store"
      >
        <View style={styles.circleOuter}>
          <View style={[styles.circle, styles.addCircle]}>
            <LinearGradient colors={["#ECFDF5", "#E0F2FE"]} style={styles.circleFill}>
              <View style={styles.addInner}>
                <Ionicons name="add" size={34} color={GatiMitraMerchant.navy} />
              </View>
            </LinearGradient>
          </View>
        </View>
        <Text style={styles.storeNameText}>Add Store</Text>
        <Text style={styles.addSubtext}>Start a new onboarding</Text>
      </Pressable>
    </Animated.View>
  );
}

function SelectStoreHeading({ storeCount }: { storeCount: number }) {
  return (
    <View style={styles.selectStoreHeader}>
      <View style={styles.selectStoreLine} />
      <View style={styles.selectStoreCenter}>
        <Text style={styles.selectStoreLabel}>SELECT STORE</Text>
        {storeCount > 0 ? (
          <Text style={styles.selectStoreCount}>
            {storeCount} store{storeCount === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>
      <View style={styles.selectStoreLine} />
    </View>
  );
}

export default function PartnerHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { partner, signOut } = useAuth();
  const { setSelectedStore } = useSelectedStore();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(92);
  const headerImage = useAppAssetSource(MX.auth.header);
  const heroAnim = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const cardsAnim = useRef(new Animated.Value(0)).current;

  const gridItemWidth = useMemo(() => {
    const columns = screenWidth >= 920 ? 3 : 2;
    const gap = 16;
    const available = screenWidth - H_PADDING * 2 - gap * (columns - 1);
    return Math.floor(available / columns);
  }, [screenWidth]);
  const topInset = Math.max(insets.top, SAFE_AREA_TOP_MIN);
  const heroHeight = HERO_BODY_HEIGHT + topInset;
  const bannerOverlap = Math.round(bannerHeight * BANNER_OVERLAP_RATIO);

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    await signOut();
    router.replace("/(auth)/welcome");
  };

  const storesOrdered = useMemo(() => {
    if (!partner) return [];
    return [...partner.childStores].sort((a, b) => {
      const aOk = String(a.approval_status || "").toUpperCase() === "APPROVED" ? 1 : 0;
      const bOk = String(b.approval_status || "").toUpperCase() === "APPROVED" ? 1 : 0;
      if (aOk !== bOk) return bOk - aOk;
      return (a.store_name || "").localeCompare(b.store_name || "");
    });
  }, [partner]);

  if (!partner) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const { parent, childStores } = partner;
  const businessName = parent.brand_name || parent.parent_name || "—";
  const displayStoreName = truncateName(businessName);

  const openStore = (store: ChildStore) => {
    const approved = String(store.approval_status || "").toUpperCase() === "APPROVED";
    if (approved) {
      setSelectedStore(store);
      router.replace("/(tabs)");
      return;
    }
    void Linking.openURL(onboardingUrl(parent.id, store.store_id));
  };

  const openAddStore = () => {
    void Linking.openURL(onboardingUrl(parent.id));
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(bannerAnim, {
        toValue: 1,
        duration: 460,
        delay: 120,
        useNativeDriver: true,
      }),
      Animated.timing(cardsAnim, {
        toValue: 1,
        duration: 900,
        delay: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroAnim, bannerAnim, cardsAnim]);

  const heroOpacity = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const bannerTranslate = bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const bannerOpacity = bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.container}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <LinearGradient
        colors={["#F8FAFC", "#FFFFFF", "#EFF6FF"]}
        style={StyleSheet.absoluteFill}
      />

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
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setAccountSheetVisible(false)}>
          <Pressable style={styles.bottomSheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.sheetTitle}>Partner account</Text>
            <View style={styles.sheetRows}>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetRowLabel}>Merchant ID</Text>
                <Text style={styles.sheetRowValue}>{parent.parent_merchant_id}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetRowLabel}>Business</Text>
                <Text style={styles.sheetRowValue}>{businessName}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetRowLabel}>Owner</Text>
                <Text style={styles.sheetRowValue}>{parent.owner_name}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.sheetRowLabel}>Email</Text>
                <Text style={styles.sheetRowValue}>{parent.owner_email || "—"}</Text>
              </View>
              <View style={[styles.sheetRow, styles.sheetRowLast]}>
                <Text style={styles.sheetRowLabel}>Stores</Text>
                <Text style={styles.sheetRowValue}>
                  {childStores.length} store{childStores.length === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.sheetCloseBtn, pressed && styles.pressed]}
              onPress={() => setAccountSheetVisible(false)}
            >
              <Text style={styles.sheetCloseBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: heroOpacity }}>
          <View style={styles.heroWrap}>
            {headerImage ? (
              <ImageBackground
                source={headerImage}
                style={[styles.headerBg, { height: heroHeight }]}
                imageStyle={[
                  styles.headerImageShift,
                  {
                    height: heroHeight + 56,
                    transform: [{ translateY: -(topInset + 2) }],
                  },
                ]}
                resizeMode="cover"
              >
                <LinearGradient
                  colors={[
                    "rgba(2,6,23,0.22)",
                    "rgba(12,74,110,0.08)",
                    "transparent",
                    "rgba(2,6,23,0.58)",
                  ]}
                  style={styles.headerFade}
                />
              </ImageBackground>
            ) : (
              <LinearGradient
                colors={["#CCFBF1", "#E0F2FE"]}
                style={[styles.headerBg, { height: heroHeight }]}
              />
            )}
          </View>
        </Animated.View>

        <Animated.View
          onLayout={(event) => {
            const nextHeight = Math.round(event.nativeEvent.layout.height);
            if (nextHeight > 0 && nextHeight !== bannerHeight) {
              setBannerHeight(nextHeight);
            }
          }}
          style={[
            styles.welcomeCardWrap,
            {
              marginTop: -bannerOverlap,
              opacity: bannerOpacity,
              transform: [{ translateY: bannerTranslate }],
            },
          ]}
        >
          <LinearGradient colors={["#19C59A", "#33B5E7"]} style={styles.welcomeCard}>
            <LinearGradient
              colors={["rgba(255,255,255,0.26)", "rgba(255,255,255,0.08)"]}
              style={styles.glassOverlay}
            />
            <View style={styles.bannerGlowOrb} />
            <View style={styles.welcomeCardContent}>
              <Text style={styles.welcomeTitle} numberOfLines={1}>
                Welcome, {displayStoreName}
              </Text>
              <Text style={styles.welcomeSubtitle}>Manage your partner account</Text>
              <View style={styles.welcomeMetaRow}>
                <Text style={styles.welcomeId}>{parent.parent_merchant_id}</Text>
              </View>
            </View>
            <View style={styles.welcomeActions}>
              <Pressable
                style={({ pressed }) => [styles.profileBadge, pressed && styles.pressed]}
                onPress={() => setAccountSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Open partner account details"
              >
                <Ionicons name="person-circle" size={30} color="#0F172A" />
              </Pressable>
              <Pressable
                onPress={() => setLogoutModalVisible(true)}
                style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
              >
                <Ionicons name="log-out-outline" size={16} color="#0F172A" />
                <Text style={styles.signOutBtnText}>Sign out</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>

        <SelectStoreHeading storeCount={childStores.length} />

        <View style={styles.profileGrid}>
          {storesOrdered.map((store, index) => (
            <StoreProfileCircle
              key={store.store_id}
              store={store}
              itemWidth={gridItemWidth}
              onPress={() => openStore(store)}
              animationValue={cardsAnim}
              animationStart={Math.min(0.72, index * 0.08)}
            />
          ))}
          <AddStoreCircle
            itemWidth={gridItemWidth}
            onPress={openAddStore}
            animationValue={cardsAnim}
            animationStart={Math.min(0.92, storesOrdered.length * 0.08)}
          />
        </View>

        {childStores.length === 0 ? (
          <Text style={styles.emptyHint}>No store registered yet. Tap Add Store to get started.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  muted: { fontSize: 14, color: GatiMitraMerchant.textTertiary },
  heroWrap: { marginBottom: 0, zIndex: 1 },
  headerBg: {
    width: "100%",
    overflow: "hidden",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 12,
  },
  headerImageShift: {
    width: "100%",
  },
  headerFade: {
    ...StyleSheet.absoluteFillObject,
  },
  welcomeCardWrap: {
    marginBottom: 14,
    zIndex: 3,
  },
  welcomeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 11,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 14,
      },
      android: { elevation: 7 },
      default: {},
    }),
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerGlowOrb: {
    position: "absolute",
    right: -26,
    top: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  welcomeCardContent: { flex: 1, minWidth: 0, marginRight: 10, paddingTop: 2 },
  welcomeActions: { alignItems: "flex-end", gap: 8, paddingTop: 0 },
  welcomeMetaRow: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  profileBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.95)",
    marginTop: 2,
  },
  welcomeId: {
    marginTop: 0,
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.3,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
  },
  signOutBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F172A",
  },
  pressed: { opacity: 0.88 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,6,23,0.42)",
  },
  bottomSheetCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
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
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  sheetRows: {
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
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
    borderBottomColor: "rgba(226,232,240,0.9)",
    gap: 10,
  },
  sheetRowLast: { borderBottomWidth: 0 },
  sheetRowLabel: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  sheetRowValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  sheetCloseBtn: {
    marginTop: 14,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  sheetCloseBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  selectStoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 0,
    marginBottom: 24,
    gap: 12,
    paddingHorizontal: H_PADDING,
  },
  selectStoreLine: {
    flex: 1,
    height: 1,
    backgroundColor: GatiMitraMerchant.border,
  },
  selectStoreCenter: { alignItems: "center", gap: 2 },
  selectStoreLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: GatiMitraMerchant.textSecondary,
  },
  selectStoreCount: {
    fontSize: 10,
    fontWeight: "500",
    color: GatiMitraMerchant.textTertiary,
  },
  profileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: 16,
    rowGap: 16,
    paddingHorizontal: H_PADDING,
    paddingBottom: 16,
  },
  profileItem: {
    alignItems: "center",
  },
  profileItemPressed: { opacity: 0.92, transform: [{ scale: 0.97 }] },
  circleOuter: { alignItems: "center" },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  circlePendingRing: {
    borderColor: "#BBF7D0",
  },
  circleDelisted: {
    opacity: 0.55,
  },
  circleFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  circleInitial: {
    fontSize: 40,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    opacity: 0.35,
  },
  circleImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  circleOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  pendingLetter: {
    fontSize: 44,
    fontWeight: "800",
    color: "#047857",
  },
  leafBadge: {
    position: "absolute",
    top: -6,
    alignSelf: "center",
    backgroundColor: "#22C55E",
    borderRadius: 14,
    padding: 5,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  statusBadge: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  storeIdText: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  storeNameText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    lineHeight: 19,
  },
  tapHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "500",
    color: GatiMitraMerchant.primaryDark,
    textAlign: "center",
  },
  addSubtext: {
    marginTop: 3,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 15,
  },
  addCircle: {
    borderStyle: "dashed",
    borderColor: "#93C5FD",
    backgroundColor: "rgba(255,255,255,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  addInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  completeBtn: {
    marginTop: 10,
    width: "100%",
    backgroundColor: GatiMitraMerchant.navy,
    paddingVertical: 9,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
  },
  completeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyHint: {
    textAlign: "center",
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 4,
    paddingHorizontal: H_PADDING,
    lineHeight: 19,
  },
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
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 18,
    padding: 24,
    ...GatiMitraMerchant.shadow,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
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
  modalBtnCancel: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  modalBtnLogout: { backgroundColor: GatiMitraMerchant.error },
  modalBtnCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  modalBtnLogoutText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
