/**
 * Partner home — cover header, welcome card, collapsible partner account, profile-circle store grid (Partner Site style).
 */

import { useMemo, useState } from "react";
import {
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
  LayoutAnimation,
  UIManager,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { resolveImageUrl } from "@/services/outletApi";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  CARD_PADDING,
  BUTTON_RADIUS,
  SAFE_AREA_TOP_MIN,
} from "@/constants/theme";
import type { ChildStore, PartnerParent } from "@/context/AuthContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DIVIDER_HEIGHT = 32;
const DIAGONAL_LEFT_OFFSET = 20;
const STORE_NAME_MAX_CHARS = 28;
const CIRCLE_SIZE = 118;
const GRID_GAP = 28;
const HEADER_IMAGE = require("../../public/portalheader.png");
const PARTNER_BASE = "https://partner.gatimitra.com";

function HeaderDiagonalDivider() {
  const { width } = useWindowDimensions();
  const w = width;
  const h = DIVIDER_HEIGHT;
  const d = DIAGONAL_LEFT_OFFSET;
  const path = `M 0 ${d} L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
  return (
    <View style={styles.waveWrap}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <Path d={path} fill="#F8FAFC" />
      </Svg>
    </View>
  );
}

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

function getStatusBadge(store: ChildStore): { label: string; bg: string; text: string } {
  if (isOnboardingPending(store)) {
    return { label: "Pending", bg: "#22C55E", text: "#FFFFFF" };
  }
  const s = String(store.approval_status || "").toUpperCase();
  if (s === "APPROVED") return { label: "Verified", bg: "#DCFCE7", text: "#166534" };
  if (s === "REJECTED") return { label: "Rejected", bg: "#FEE2E2", text: "#991B1B" };
  if (s === "UNDER_VERIFICATION") return { label: "Under review", bg: "#FEF3C7", text: "#92400E" };
  if (s === "DELISTED") return { label: "Delisted", bg: "#E2E8F0", text: "#475569" };
  return { label: store.approval_status || "Pending", bg: "#F1F5F9", text: "#475569" };
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
}: {
  store: ChildStore;
  itemWidth: number;
  onPress: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const pending = isOnboardingPending(store);
  const badge = getStatusBadge(store);
  const bannerUri = !pending ? resolveImageUrl(store.banner_url) : null;
  const showBanner = Boolean(bannerUri && !imageFailed);
  const delisted = String(store.approval_status || "").toUpperCase() === "DELISTED";
  const approved = String(store.approval_status || "").toUpperCase() === "APPROVED";

  return (
    <Pressable
      onPress={delisted ? undefined : onPress}
      style={({ pressed }) => [
        styles.profileItem,
        { width: itemWidth },
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
            <LinearGradient
              colors={["#ECFDF5", "#D1FAE5", "#A7F3D0"]}
              style={styles.circleFill}
            >
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
              <LinearGradient
                colors={["#F8FAFC", "#EFF6FF", "#F5F3FF"]}
                style={styles.circleFill}
              >
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

        <Text style={[styles.storeIdText, { maxWidth: itemWidth }]} numberOfLines={1}>
          {store.store_id}
        </Text>
      </View>

      <Text style={[styles.storeNameText, { maxWidth: itemWidth }]} numberOfLines={2}>
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
  );
}

function AddStoreCircle({ itemWidth, onPress }: { itemWidth: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileItem,
        { width: itemWidth },
        pressed && styles.profileItemPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Add new store"
    >
      <View style={styles.circleOuter}>
        <View style={[styles.circle, styles.addCircle]}>
          <View style={styles.addInner}>
            <Ionicons name="add" size={38} color={GatiMitraMerchant.navy} />
          </View>
        </View>
      </View>
      <Text style={[styles.storeNameText, { maxWidth: itemWidth }]}>Add Store</Text>
      <Text style={styles.addSubtext}>Start a new onboarding</Text>
    </Pressable>
  );
}

function CollapsiblePartnerAccount({
  parent,
  childCount,
}: {
  parent: PartnerParent;
  childCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const businessName = parent.brand_name || parent.parent_name || "—";

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.section}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.accountCard, pressed && styles.pressed]}
      >
        <View style={styles.accountCardHeader}>
          <View style={styles.sectionHeaderLeft}>
            <View style={styles.accountIconWrap}>
              <Ionicons name="person" size={16} color={GatiMitraMerchant.navy} />
            </View>
            <View style={styles.accountHeaderText}>
              <Text style={styles.sectionTitle}>Partner account</Text>
              {!expanded ? (
                <Text style={styles.accountPreview} numberOfLines={1}>
                  {parent.parent_merchant_id} · {childCount} store{childCount === 1 ? "" : "s"}
                </Text>
              ) : null}
            </View>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={GatiMitraMerchant.textSecondary}
          />
        </View>

        {expanded ? (
          <View style={styles.accountDetails}>
            <Row label="ID" value={parent.parent_merchant_id} last={false} />
            <Row label="Business" value={businessName} last={false} />
            <Row label="Owner" value={parent.owner_name} last={false} />
            <Row label="Email" value={parent.owner_email || "—"} last={false} />
            <Row label="Child stores" value={String(childCount)} last />
          </View>
        ) : null}
      </Pressable>
    </View>
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

  const gridItemWidth = useMemo(() => {
    const columns = 2;
    const available = screenWidth - H_PADDING * 2 - GRID_GAP * (columns - 1);
    return Math.floor(available / columns);
  }, [screenWidth]);

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
  const topInset = Math.max(insets.top, SAFE_AREA_TOP_MIN);

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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#F8FAFC", "#FFFFFF", "#EFF6FF"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.headerWrap, { paddingTop: topInset }]}>
        <ImageBackground source={HEADER_IMAGE} style={styles.headerBg} resizeMode="cover">
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.15)"]}
            style={styles.headerFade}
          />
        </ImageBackground>
        <View style={styles.waveContainer}>
          <HeaderDiagonalDivider />
        </View>
      </View>

      <View style={styles.welcomeCardWrap}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeCardContent}>
            <Text style={styles.welcomeTitle} numberOfLines={1}>
              Welcome, {displayStoreName}
            </Text>
            <Text style={styles.welcomeSubtitle}>Manage your partner account</Text>
            <Text style={styles.welcomeId}>{parent.parent_merchant_id}</Text>
          </View>
          <Pressable
            onPress={() => setLogoutModalVisible(true)}
            style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={18} color={GatiMitraMerchant.textPrimary} />
            <Text style={styles.signOutBtnText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <CollapsiblePartnerAccount parent={parent} childCount={childStores.length} />

        <SelectStoreHeading storeCount={childStores.length} />

        <View style={[styles.profileGrid, { gap: GRID_GAP }]}>
          {storesOrdered.map((store) => (
            <StoreProfileCircle
              key={store.store_id}
              store={store}
              itemWidth={gridItemWidth}
              onPress={() => openStore(store)}
            />
          ))}
          <AddStoreCircle itemWidth={gridItemWidth} onPress={openAddStore} />
        </View>

        {childStores.length === 0 ? (
          <Text style={styles.emptyHint}>No store registered yet. Tap Add Store to get started.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  muted: { fontSize: 14, color: GatiMitraMerchant.textTertiary },
  headerWrap: {
    position: "relative",
    paddingHorizontal: H_PADDING,
    paddingBottom: 0,
    backgroundColor: "#fff",
  },
  headerBg: {
    width: "100%",
    minHeight: 148,
    overflow: "hidden",
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  headerFade: {
    ...StyleSheet.absoluteFillObject,
  },
  waveContainer: {
    position: "absolute",
    bottom: 0,
    left: -H_PADDING,
    right: -H_PADDING,
    height: DIVIDER_HEIGHT,
  },
  waveWrap: { width: "100%", height: "100%" },
  welcomeCardWrap: {
    paddingHorizontal: H_PADDING,
    marginTop: -18,
    marginBottom: 4,
    zIndex: 2,
  },
  welcomeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.8)",
    ...GatiMitraMerchant.shadowCard,
  },
  welcomeCardContent: { flex: 1, minWidth: 0, marginRight: 10 },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.2,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 3,
  },
  welcomeId: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.3,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  signOutBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  pressed: { opacity: 0.88 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PADDING, paddingBottom: 48 },
  section: { marginBottom: 4 },
  accountCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowCard,
  },
  accountCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accountIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  accountHeaderText: { flex: 1, minWidth: 0 },
  accountPreview: {
    marginTop: 2,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  accountDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.divider,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  rowLabel: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  rowValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "right",
  },
  selectStoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
    gap: 12,
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
    paddingBottom: 16,
  },
  profileItem: {
    alignItems: "center",
    marginBottom: 8,
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
    borderRadius: CARD_RADIUS,
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
