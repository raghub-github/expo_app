/**
 * Partner home — after login: Partner account card + Your child stores + Add new child store.
 * Matches second image: GatiMitra logo, Partner account (ID, Business, Owner, Email), child stores list.
 */

import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, CARD_PADDING, BUTTON_RADIUS } from "@/constants/theme";
import type { ChildStore } from "@/context/AuthContext";

function StatusPill({ label, variant }: { label: string; variant: "grey" | "green" | "yellow" | "orange" }) {
  const colors = {
    grey: { bg: "#E2E8F0", text: "#475569" },
    green: { bg: "#DCFCE7", text: "#166534" },
    yellow: { bg: "#FEF9C3", text: "#854D0E" },
    orange: { bg: "#FFEDD5", text: "#C2410C" },
  };
  const c = colors[variant];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

function ChildStoreCard({
  store,
  onContinue,
}: {
  store: ChildStore;
  onContinue: () => void;
}) {
  const statusLabel = store.approval_status === "DELISTED" ? "DELISTED" : store.approval_status === "DRAFT" ? "DRAFT" : store.approval_status ?? "DRAFT";
  const statusVariant = statusLabel === "DELISTED" ? "grey" : statusLabel === "DRAFT" ? "yellow" : "grey";
  const paymentVariant = store.payment_status === "Completed" ? "green" : "orange";
  const isApprovedAndPaid = statusLabel !== "DELISTED" && store.payment_status === "Completed";
  const canOpenDashboard = isApprovedAndPaid;
  const ctaLabel = canOpenDashboard ? "Open dashboard" : "Continue setup";
  const canClick = statusLabel !== "DELISTED";

  return (
    <View style={styles.childCard}>
      <Text style={styles.childName} numberOfLines={1}>{store.store_name}</Text>
      <Text style={styles.childId}>{store.store_id}</Text>
      <Text style={styles.childAddress} numberOfLines={1}>{store.full_address}</Text>
      <View style={styles.pillRow}>
        <StatusPill label={statusLabel} variant={statusVariant} />
        <StatusPill label={`Payment: ${store.payment_status}`} variant={paymentVariant} />
      </View>
      <View style={styles.childFooter}>
        <Text style={styles.stepText}>Step {store.current_step}/{store.total_steps}</Text>
        {store.registration_status === "IN_PROGRESS" && (
          <Text style={styles.awaitingText}>Awaiting verification</Text>
        )}
        <Pressable
          style={[styles.continueBtn, !canClick && styles.continueBtnDisabled]}
          onPress={canClick ? onContinue : undefined}
          disabled={!canClick}
        >
          <Text style={styles.continueBtnText}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function PartnerHomeScreen() {
  const router = useRouter();
  const { partner, signOut } = useAuth();
  const { setSelectedStore } = useSelectedStore();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    await signOut();
    router.replace("/(auth)/welcome");
  };

  if (!partner) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const { parent, childStores } = partner;
  const businessName = parent.brand_name || parent.parent_name || "—";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>GatiMitra</Text>
        <Pressable onPress={() => setLogoutModalVisible(true)} style={styles.headerBtn}>
          <Ionicons name="log-out-outline" size={22} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
      </View>

      {/* Centralized logout confirmation modal */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setLogoutModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Log out?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to log out of your account?
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.modalBtnPressed]}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnLogout, pressed && styles.modalBtnPressed]}
                onPress={handleLogoutConfirm}
              >
                <Text style={styles.modalBtnLogoutText}>Log out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Partner account card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={18} color={GatiMitraMerchant.textSecondary} />
            <Text style={styles.sectionTitle}>Partner account</Text>
          </View>
          <View style={styles.card}>
            <Row label="ID" value={parent.parent_merchant_id} last={false} />
            <Row label="Business" value={businessName} last={false} />
            <Row label="Owner" value={parent.owner_name} last={false} />
            <Row label="Email" value={parent.owner_email || "—"} last />
          </View>
        </View>

        {/* Your child stores */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="business-outline" size={18} color={GatiMitraMerchant.textSecondary} />
            <Text style={styles.sectionTitle}>Your child stores</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            onPress={() => router.push("/(auth)/signup-webview")}
          >
            <Text style={styles.addBtnText}>+ Add new child store</Text>
          </Pressable>

          {childStores.length === 0 ? (
            <View style={styles.emptyStores}>
              <Text style={styles.emptyText}>No stores yet. Add your first store above.</Text>
            </View>
          ) : (
            childStores.map((store) => (
              <ChildStoreCard
                key={store.id}
                store={store}
                onContinue={() => {
                  setSelectedStore(store);
                  router.replace("/(tabs)");
                }}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  muted: { fontSize: 14, color: GatiMitraMerchant.textTertiary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  logo: { fontSize: 20, fontWeight: "700", color: GatiMitraMerchant.navy },
  headerBtn: { padding: 8 },
  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  card: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    ...GatiMitraMerchant.shadowCard,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.divider },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  rowValue: { fontSize: 14, fontWeight: "500", color: GatiMitraMerchant.textPrimary, maxWidth: "60%" },
  addBtn: {
    backgroundColor: GatiMitraMerchant.navy,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    alignItems: "center",
    marginBottom: 16,
  },
  addBtnPressed: { opacity: 0.9 },
  addBtnText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  emptyStores: { padding: 24, alignItems: "center" },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textTertiary },
  childCard: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    marginBottom: 12,
    ...GatiMitraMerchant.shadowCard,
  },
  childName: { fontSize: 16, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  childId: { fontSize: 13, color: GatiMitraMerchant.textTertiary, marginTop: 4 },
  childAddress: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 12, fontWeight: "500" },
  childFooter: { marginTop: 12, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  stepText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  awaitingText: { fontSize: 13, color: GatiMitraMerchant.warning },
  continueBtn: {
    marginLeft: "auto",
    backgroundColor: GatiMitraMerchant.navy,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: BUTTON_RADIUS,
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },

  // Logout confirmation modal (centralized)
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
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancel: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  modalBtnLogout: {
    backgroundColor: GatiMitraMerchant.error,
  },
  modalBtnPressed: { opacity: 0.9 },
  modalBtnCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  modalBtnLogoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
