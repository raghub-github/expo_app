import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraMerchant, H_PADDING, TAB_BAR_SCROLL_CONTENT_PADDING } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getRushStatus, startRushWindow, stopRushWindow } from "@/services/rushApi";
import { formatStoreActionSourceLabel } from "@/lib/storeActionSource";

const DURATION_OPTIONS = [
  { id: "30", label: "30 minutes", minutes: 30 },
  { id: "60", label: "1 hour", minutes: 60 },
  { id: "90", label: "1 hour 30 minutes", minutes: 90 },
  { id: "120", label: "2 hours", minutes: 120 },
];

export default function PreparationTimeScreen() {
  const router = useRouter();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState<number>(0);
  const [activeDurationId, setActiveDurationId] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [rushActive, setRushActive] = useState(false);
  const [rushSourceLabel, setRushSourceLabel] = useState<string | null>(null);

  const storeId = selectedStore?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!storeId || !token) {
      setLoading(false);
      setError("Select a store from Partner Home first.");
      return;
    }
    setLoading(true);
    getRushStatus(storeId, token)
      .then((status) => {
        if (cancelled) return;
        const isActive = status.is_active && status.remaining_minutes > 0;
        setRemainingMinutes(isActive ? status.remaining_minutes : 0);
        setRushActive(isActive);
        setRushSourceLabel(
          isActive ? formatStoreActionSourceLabel(status.marked_from) : null
        );
        if (status.is_active && status.duration_minutes != null) {
          const match = DURATION_OPTIONS.find(
            (o) => o.minutes === status.duration_minutes
          );
          setActiveDurationId(match?.id ?? null);
        } else {
          setActiveDurationId(null);
        }
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Unable to load rush status right now. You can still start a rush window below.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  const handleConfirmRequest = async () => {
    if (!storeId || !token || !selectedId) return;
    const minutes =
      DURATION_OPTIONS.find((o) => o.id === selectedId)?.minutes ?? 0;
    if (!minutes) return;
    setSaving(true);
    try {
      const status = await startRushWindow(storeId, minutes, token);
      const isActive = status.is_active && status.remaining_minutes > 0;
      setRemainingMinutes(isActive ? status.remaining_minutes : 0);
      setRushActive(isActive);
      setRushSourceLabel(
        isActive ? formatStoreActionSourceLabel(status.marked_from) ?? "Merchant app" : null
      );
      setSelectedId(null);
      const match = DURATION_OPTIONS.find(
        (o) => o.minutes === status.duration_minutes
      );
      setActiveDurationId(match?.id ?? null);
    } catch (e) {
      setError("Could not start rush window. Please try again in a moment.");
    } finally {
      setSaving(false);
      setConfirmVisible(false);
    }
  };

  const activeLabel =
    rushActive && remainingMinutes > 0
      ? `Rush mode is active for the next ~${remainingMinutes} minutes.${
          rushSourceLabel ? ` Set via ${rushSourceLabel}.` : ""
        }`
      : "Rush mode is currently OFF.";

  const handleToggleRush = (next: boolean) => {
    if (!storeId || !token) return;
    if (next && !rushActive) {
      // When turning ON, use currently selected duration (or default first option)
      if (!selectedId && DURATION_OPTIONS.length > 0) {
        setSelectedId(DURATION_OPTIONS[0].id);
      }
      setConfirmVisible(true);
      return;
    }
    if (!next && rushActive) {
      Alert.alert(
        "Turn off rush mode?",
        "Rush mode will be turned off immediately for new orders.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Turn off",
            style: "destructive",
            onPress: async () => {
              try {
                const status = await stopRushWindow(storeId, token);
                const isActive = status.is_active && status.remaining_minutes > 0;
                setRushActive(isActive);
                setRushSourceLabel(null);
                setRemainingMinutes(isActive ? status.remaining_minutes : 0);
                setActiveDurationId(null);
              } catch {
                Alert.alert(
                  "Unable to turn off",
                  "Please try again in a moment."
                );
              }
            },
          },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="flash-outline" size={30} color="#FACC15" />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>
              Inform us when your kitchen is in rush and you need more time to
              manage orders.
            </Text>
            <View style={styles.heroStatusRow}>
              <Text style={styles.heroSubtitle}>{activeLabel}</Text>
              <View style={styles.heroStatusControls}>
                <Switch
                  value={rushActive}
                  onValueChange={handleToggleRush}
                  trackColor={{
                    false: "#D1D5DB",
                    true: GatiMitraMerchant.primary,
                  }}
                  thumbColor={rushActive ? "#FFFFFF" : "#F9FAFB"}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How this helps you</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletNumber}>1</Text>
            <Text style={styles.bulletText}>Get more time to prepare food</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletNumber}>2</Text>
            <Text style={styles.bulletText}>
              Show correct delivery time to customers
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletNumber}>3</Text>
            <Text style={styles.bulletText}>
              Avoid crowding of riders at your restaurant
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Increase food preparation time for the next
          </Text>
          {activeDurationId && (
            <View style={styles.currentChip}>
              <Text style={styles.currentChipText}>
                Active:{" "}
                {
                  DURATION_OPTIONS.find((o) => o.id === activeDurationId)
                    ?.label
                }
              </Text>
            </View>
          )}
          {DURATION_OPTIONS.map((opt) => {
            const active = selectedId === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelectedId(opt.id)}
                style={({ pressed }) => [
                  styles.optionRow,
                  active && styles.optionRowActive,
                  pressed && styles.optionRowPressed,
                ]}
              >
                <View
                  style={[styles.radioOuter, active && styles.radioOuterActive]}
                >
                  {active && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.optionLabel}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error && (
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          disabled={!selectedId || saving || loading || !storeId || !token}
          onPress={() => setConfirmVisible(true)}
          style={({ pressed }) => [
            styles.confirmBtn,
            (!selectedId || saving || loading || !storeId || !token) &&
              styles.confirmBtnDisabled,
            pressed && selectedId && !saving && styles.confirmBtnPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmText}>Confirm</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setConfirmVisible(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>Confirm rush hours</Text>
            <Text style={styles.modalMessage}>
              This will temporarily increase food preparation time for all new
              orders. Customers and riders will see a higher ETA.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setConfirmVisible(false)}
                style={[styles.modalBtn, styles.modalBtnSecondary]}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmRequest}
                disabled={saving}
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  saving && styles.modalBtnDisabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>
                    Yes, start rush
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  pressed: {
    opacity: 0.75,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    gap: 14,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  heroTextWrap: {
    flex: 1,
    gap: 6,
  },
  heroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  heroSubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  heroStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  heroStatusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroStatusControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  section: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  currentChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 6,
  },
  currentChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  bulletNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    textAlign: "center",
    textAlignVertical: "center",
    color: GatiMitraMerchant.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    paddingHorizontal: 4,
  },
  optionRowActive: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  optionRowPressed: {
    opacity: 0.8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  radioOuterActive: {
    borderColor: GatiMitraMerchant.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GatiMitraMerchant.primary,
  },
  optionLabel: {
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    color: GatiMitraMerchant.error,
    textAlign: "left",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    backgroundColor: GatiMitraMerchant.background,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  confirmBtn: {
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnPressed: {
    opacity: 0.8,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 18,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalBtnSecondary: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  modalBtnPrimary: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  modalBtnDisabled: {
    opacity: 0.6,
  },
  modalBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  modalBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

