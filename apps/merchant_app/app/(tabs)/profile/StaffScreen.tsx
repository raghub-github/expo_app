import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, BUTTON_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  getStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  type StaffMember,
  type StoreSession,
} from "@/services/staffApi";
import {
  getUserSessions,
  logoutAllUserSessions,
  logoutUserSessions,
  type UserDeviceSession,
} from "@/services/userSessionsApi";

function parsePgTimestamp(iso: string): Date | null {
  if (!iso) return null;
  const raw = String(iso).trim();

  // First try native parsing for already-normal forms.
  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;

  // Handle Postgres style: "YYYY-MM-DD hh:mm:ss[.ffffff][+/-HH[MM]]"
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-]\d{2})(?::?(\d{2}))?)?$/.exec(
      raw,
    );
  if (!m) return null;

  const [, y, mo, da, h, mi, s, frac, offH, offM] = m;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(da);
  const hour = Number(h);
  const minute = Number(mi);
  const sec = Number(s);
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0;

  let utcMs = Date.UTC(year, month, day, hour, minute, sec, ms);

  if (offH) {
    const sign = offH.startsWith("-") ? -1 : 1;
    const absH = Math.abs(Number(offH));
    const absM = offM ? Number(offM) : 0;
    const offsetMinutes = sign * (absH * 60 + absM);
    utcMs -= offsetMinutes * 60 * 1000;
  }

  return new Date(utcMs);
}

function formatDateTime(iso: string): string {
  const d = parsePgTimestamp(iso);
  if (!d) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRelative(iso: string): string {
  const d = parsePgTimestamp(iso);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function isValidPhone(num: string): boolean {
  const cleaned = num.replace(/[\s\-]/g, "");
  return /^(\+?\d{10,15})$/.test(cleaned);
}

type StaffModalState = {
  visible: boolean;
  mode: "add" | "edit";
  staff?: StaffMember;
  name: string;
  phone: string;
  role: string;
};

export default function StaffScreen() {
  const router = useRouter();
  const { selectedStore } = useSelectedStore();
  const { token, partner, signOut } = useAuth();
  const storeId = selectedStore?.id ?? null;

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [sessions, setSessions] = useState<StoreSession[]>([]);
  const [userSessions, setUserSessions] = useState<UserDeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffModal, setStaffModal] = useState<StaffModalState | null>(null);

  const load = async () => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    setLoading(true);
    try {
      const [staffList, storeSess, userSess] = await Promise.all([
        getStaff(storeId, token),
        // keep store sessions for future use; currently we surface account-level sessions in UI
        Promise.resolve<StoreSession[]>([]),
        getUserSessions(token),
      ]);
      setStaff(staffList);
      setSessions(storeSess);
      setUserSessions(userSess);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [storeId, token]);

  const openAddStaff = () => {
    setStaffModal({
      visible: true,
      mode: "add",
      name: "",
      phone: "",
      role: "STAFF",
    });
  };

  const openEditStaff = (s: StaffMember) => {
    setStaffModal({
      visible: true,
      mode: "edit",
      staff: s,
      name: s.name,
      phone: s.phone_number,
      role: s.role,
    });
  };

  const saveStaff = async () => {
    if (!staffModal || !storeId || !token) return;
    const name = staffModal.name.trim();
    const phone = staffModal.phone.trim();
    const role = staffModal.role.trim() || "STAFF";
    if (!name || !phone) {
      Alert.alert("Missing details", "Please enter staff name and phone number.");
      return;
    }
    if (!isValidPhone(phone)) {
      Alert.alert("Invalid number", "Please enter a valid phone number (10–15 digits).");
      return;
    }
    setSaving(true);
    try {
      if (staffModal.mode === "add") {
        const created = await createStaff(storeId, { name, phone_number: phone, role }, token);
        setStaff((prev) => [...prev, created]);
      } else if (staffModal.staff) {
        const updated = await updateStaff(
          storeId,
          staffModal.staff.id,
          { name, phone_number: phone, role },
          token
        );
        setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      }
      setStaffModal(null);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save staff details.");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemoveStaff = (s: StaffMember) => {
    Alert.alert(
      "Remove staff?",
      `This will disable ${s.name}'s access.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (!storeId || !token) return;
            setSaving(true);
            try {
              await deleteStaff(storeId, s.id, token);
              setStaff((prev) => prev.filter((x) => x.id !== s.id));
            } catch (e) {
              Alert.alert("Failed", e instanceof Error ? e.message : "Could not remove staff.");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleLogoutSession = async (sessionId: number) => {
    if (!token) return;
    try {
      await logoutUserSessions(token, [sessionId]);
      setUserSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not logout device.");
    }
  };

  const handleLogoutAll = async () => {
    if (!token) return;
    try {
      // includeCurrent = true so this device is also logged out at the backend level
      await logoutAllUserSessions(token, true);
      setUserSessions([]);
      // Clear local auth state and return to auth flow
      await signOut();
      router.replace("/");
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not logout all devices.");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading staff & devices…</Text>
      </View>
    );
  }

  if (error && !staff.length && !sessions.length) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const parent = partner?.parent;
  const activeUserSessions = userSessions;
  const totalDevices =
    typeof partner?.activeDevices === "number" ? partner.activeDevices : activeUserSessions.length;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Owner */}
        {parent && (
          <View style={styles.ownerCard}>
            <Text style={styles.sectionLabel}>Owner</Text>
            <View style={styles.ownerRow}>
              <View style={styles.ownerAvatar}>
                <Ionicons name="person-outline" size={24} color={GatiMitraMerchant.textSecondary} />
              </View>
              <View style={styles.ownerTextWrap}>
                <Text style={styles.ownerName}>{parent.owner_name || parent.parent_name}</Text>
                <Text style={styles.ownerPhone}>{parent.registered_phone}</Text>
                <Text style={styles.ownerEmail}>{parent.owner_email || "—"}</Text>
                <Text style={styles.ownerMeta}>
                  Logged in on {totalDevices} device{totalDevices === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Staff members */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="people-outline" size={18} color={GatiMitraMerchant.textSecondary} />
            <Text style={styles.sectionTitle}>Staff members</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            onPress={openAddStaff}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add staff</Text>
          </Pressable>
        </View>
        {staff.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No staff added yet</Text>
            <Text style={styles.emptySubtitle}>Add staff members who can manage orders and store operations.</Text>
          </View>
        ) : (
          staff.map((s) => (
            <View key={s.id} style={styles.staffCard}>
              <View style={styles.staffMainRow}>
                <View style={styles.staffAvatar}>
                  <Ionicons name="person-circle-outline" size={26} color={GatiMitraMerchant.primary} />
                </View>
                <View style={styles.staffTextWrap}>
                  <Text style={styles.staffName}>{s.name}</Text>
                  <Text style={styles.staffPhone}>{s.phone_number}</Text>
                  <View style={styles.staffMetaRow}>
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>{s.role}</Text>
                    </View>
                    <Text style={styles.staffMetaText}>Added {formatRelative(s.created_at)}</Text>
                  </View>
                </View>
                <View style={styles.staffActions}>
                  <Pressable onPress={() => openEditStaff(s)} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
                    <Ionicons name="pencil-outline" size={18} color={GatiMitraMerchant.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => confirmRemoveStaff(s)} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
                    <Ionicons name="trash-outline" size={18} color={GatiMitraMerchant.error} />
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}

        {/* Active devices */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="phone-portrait-outline" size={18} color={GatiMitraMerchant.textSecondary} />
            <Text style={styles.sectionTitle}>Active devices</Text>
          </View>
          {activeUserSessions.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.logoutAllBtn, pressed && styles.logoutAllBtnPressed]}
              onPress={() =>
                Alert.alert(
                  "Logout all devices?",
                  "All other devices will be signed out from this account.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Logout all",
                      style: "destructive",
                      onPress: handleLogoutAll,
                    },
                  ],
                  { cancelable: true },
                )
              }
            >
              <Ionicons name="power-outline" size={16} color={GatiMitraMerchant.error} />
              <Text style={styles.logoutAllText}>Logout all</Text>
            </Pressable>
          )}
        </View>
        {activeUserSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active devices</Text>
            <Text style={styles.emptySubtitle}>Devices will appear here when staff log in to this store.</Text>
          </View>
        ) : (
          activeUserSessions.map((sess) => {
            const isWeb = sess.device_type === "web";
            const isAndroid = (sess.os || "").toLowerCase().includes("android");
            const isIos = (sess.os || "").toLowerCase().includes("ios");
            const friendlyName =
              sess.device_name && !sess.device_name.startsWith("merchant_")
                ? sess.device_name
                : isWeb
                  ? "Web browser"
                  : isAndroid
                    ? "Android device"
                    : isIos
                      ? "iOS device"
                      : "Mobile device";
            const metaParts: string[] = [];
            if (sess.os) metaParts.push(sess.os);
            if (sess.ip_address) metaParts.push(sess.ip_address);
            if (sess.location) metaParts.push(sess.location);
            const metaLine = metaParts.join(" • ");

            return (
              <View key={sess.id} style={styles.sessionCard}>
                <View style={styles.sessionTopRow}>
                  <View style={styles.sessionIconWrap}>
                    <Ionicons
                      name={isWeb ? "laptop-outline" : "phone-portrait-outline"}
                      size={18}
                      color={GatiMitraMerchant.primary}
                    />
                  </View>
                  <View style={styles.sessionTextWrap}>
                    <Text style={styles.sessionDevice}>{friendlyName}</Text>
                    {!!metaLine && (
                      <Text style={styles.sessionMeta} numberOfLines={1}>
                        {metaLine}
                      </Text>
                    )}
                    <Text style={styles.sessionMeta}>
                      Login: {formatDateTime(sess.login_time)} • Last active: {formatRelative(sess.last_active)}
                    </Text>
                  </View>
                </View>
                <View style={styles.sessionFooterRow}>
                  <Text
                    style={[
                      styles.sessionStatus,
                      sess.is_active ? styles.sessionStatusActive : styles.sessionStatusInactive,
                    ]}
                  >
                    {sess.is_active ? "Active" : "Logged out"}
                  </Text>
                  {sess.is_active && (
                    <Pressable
                      style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
                      onPress={() =>
                        Alert.alert(
                          "Logout device?",
                          "This device will be signed out of your account.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Logout",
                              style: "destructive",
                              onPress: () => handleLogoutSession(sess.id),
                            },
                          ],
                          { cancelable: true },
                        )
                      }
                    >
                      <Text style={styles.logoutBtnText}>Logout this device</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add/Edit staff modal */}
      <Modal
        visible={!!staffModal?.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setStaffModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setStaffModal(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {staffModal?.mode === "add" ? "Add staff member" : "Edit staff member"}
              </Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={staffModal?.name ?? ""}
                  onChangeText={(t) =>
                    setStaffModal((prev) => (prev ? { ...prev, name: t } : prev))
                  }
                  placeholder="Staff name"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Phone number</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={staffModal?.phone ?? ""}
                  onChangeText={(t) =>
                    setStaffModal((prev) => (prev ? { ...prev, phone: t } : prev))
                  }
                  placeholder="10–15 digits"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Role</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={staffModal?.role ?? ""}
                  onChangeText={(t) =>
                    setStaffModal((prev) => (prev ? { ...prev, role: t.toUpperCase() } : prev))
                  }
                  placeholder="STAFF, MANAGER"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                />
              </View>
              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnSecondary, pressed && styles.pressed]}
                  onPress={() => setStaffModal(null)}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}
                  onPress={saveStaff}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: H_PADDING },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: { marginTop: 12, fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },

  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING, paddingBottom: 40 },

  sectionLabel: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  ownerCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 14,
    ...GatiMitraMerchant.shadowSm,
  },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerTextWrap: { flex: 1 },
  ownerName: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  ownerPhone: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  ownerEmail: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  ownerMeta: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 2 },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    marginTop: 8,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
  },
  addBtnPressed: { opacity: 0.9 },
  addBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },

  emptyCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 14,
    alignItems: "flex-start",
  },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary, marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: GatiMitraMerchant.textSecondary },

  staffCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  staffMainRow: { flexDirection: "row", alignItems: "center" },
  staffAvatar: { marginRight: 10 },
  staffTextWrap: { flex: 1 },
  staffName: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  staffPhone: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  staffMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  rolePillText: { fontSize: 11, fontWeight: "700", color: GatiMitraMerchant.textSecondary },
  staffMetaText: { fontSize: 11, color: GatiMitraMerchant.textTertiary },
  staffActions: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 },
  iconBtn: { padding: 6, borderRadius: 18 },
  iconBtnPressed: { backgroundColor: GatiMitraMerchant.surfaceSubtle },

  sessionCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 10,
  },
  sessionTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sessionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTextWrap: { flex: 1 },
  sessionDevice: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  sessionMeta: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  sessionFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sessionStatus: { fontSize: 12, fontWeight: "600" },
  sessionStatusActive: { color: GatiMitraMerchant.success },
  sessionStatusInactive: { color: GatiMitraMerchant.textTertiary },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.error,
  },
  logoutBtnPressed: { backgroundColor: "#FEF2F2" },
  logoutBtnText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.error },

  logoutAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.error,
  },
  logoutAllBtnPressed: { backgroundColor: "#FEF2F2" },
  logoutAllText: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.error },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalKeyboard: { width: "100%", maxWidth: 400 },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 18,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 10 },
  fieldGroup: { marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  fieldInput: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10 },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BUTTON_RADIUS,
    minWidth: 90,
    alignItems: "center",
  },
  modalBtnPrimary: { backgroundColor: GatiMitraMerchant.primary },
  modalBtnSecondary: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  modalBtnSecondaryText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },

  pressed: { opacity: 0.8 },
});

