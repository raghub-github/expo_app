import { useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Modal,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, TAB_BAR_SCROLL_CONTENT_PADDING } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getRushStatus, startRushWindow, stopRushWindow } from "@/services/rushApi";
import { formatStoreActionSourceLabel } from "@/lib/storeActionSource";

const DURATION_OPTIONS = [
  { id: "30", label: "30m", fullLabel: "30 minutes", minutes: 30 },
  { id: "60", label: "1h", fullLabel: "1 hour", minutes: 60 },
  { id: "90", label: "1.5h", fullLabel: "1 hour 30 minutes", minutes: 90 },
  { id: "120", label: "2h", fullLabel: "2 hours", minutes: 120 },
];

const BENEFITS = [
  { icon: "timer-outline" as const, text: "More time to prepare food" },
  { icon: "navigate-outline" as const, text: "Correct delivery ETA for customers" },
  { icon: "bicycle-outline" as const, text: "Fewer riders crowding at pickup" },
];

export default function PreparationTimeScreen() {
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
          const match = DURATION_OPTIONS.find((o) => o.minutes === status.duration_minutes);
          setActiveDurationId(match?.id ?? null);
          setSelectedId(match?.id ?? DURATION_OPTIONS[0].id);
        } else {
          setActiveDurationId(null);
          setSelectedId(DURATION_OPTIONS[0].id);
        }
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Unable to load rush status right now. You can still start a rush window below.");
        setSelectedId(DURATION_OPTIONS[0].id);
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
    const minutes = DURATION_OPTIONS.find((o) => o.id === selectedId)?.minutes ?? 0;
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
      const match = DURATION_OPTIONS.find((o) => o.minutes === status.duration_minutes);
      setActiveDurationId(match?.id ?? null);
    } catch {
      setError("Could not start rush window. Please try again in a moment.");
    } finally {
      setSaving(false);
      setConfirmVisible(false);
    }
  };

  const handleToggleRush = (next: boolean) => {
    if (!storeId || !token) return;
    if (next && !rushActive) {
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
                Alert.alert("Unable to turn off", "Please try again in a moment.");
              }
            },
          },
        ]
      );
    }
  };

  const selectedDurationLabel =
    DURATION_OPTIONS.find((o) => o.id === selectedId)?.fullLabel ?? "—";

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING + 72 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statusBanner, rushActive ? styles.statusBannerActive : styles.statusBannerOff]}>
          <View style={[styles.statusDot, rushActive && styles.statusDotActive]} />
          <View style={styles.statusTextWrap}>
            <Text style={[styles.statusTitle, rushActive && styles.statusTitleActive]}>
              {rushActive ? "Rush mode is ON" : "Rush mode is OFF"}
            </Text>
            <Text style={[styles.statusSubtitle, rushActive && styles.statusSubtitleActive]}>
              {rushActive
                ? `~${remainingMinutes} min remaining${rushSourceLabel ? ` · via ${rushSourceLabel}` : ""}`
                : "Pick a duration below, then turn rush mode on"}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={rushActive ? "#fff" : GatiMitraMerchant.primary} />
          ) : null}
        </View>

        <View style={styles.mainCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.cardTitle}>Rush mode</Text>
              <Text style={styles.cardHint}>
                {rushActive ? "Tap to turn off anytime" : "Extends prep time on new orders"}
              </Text>
            </View>
            <Switch
              value={rushActive}
              onValueChange={handleToggleRush}
              disabled={loading || saving || !storeId || !token}
              trackColor={{ false: "#D1D5DB", true: GatiMitraMerchant.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D1D5DB"
            />
          </View>

          <View style={styles.cardDivider} />

          <Text style={styles.sectionLabel}>PREP TIME BOOST</Text>
          <Text style={styles.sectionHint}>Increase food preparation time for the next</Text>

          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((opt) => {
              const active = selectedId === opt.id;
              const isRunning = activeDurationId === opt.id && rushActive;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setSelectedId(opt.id)}
                  style={({ pressed }) => [
                    styles.durationChip,
                    active && styles.durationChipActive,
                    isRunning && styles.durationChipRunning,
                    pressed && styles.durationChipPressed,
                  ]}
                >
                  <Text style={[styles.durationChipText, active && styles.durationChipTextActive]}>
                    {opt.label}
                  </Text>
                  {isRunning ? (
                    <View style={styles.runningDot} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {activeDurationId && rushActive ? (
            <View style={styles.activePill}>
              <Ionicons name="flash" size={12} color={GatiMitraMerchant.primary} />
              <Text style={styles.activePillText}>
                Active: {DURATION_OPTIONS.find((o) => o.id === activeDurationId)?.fullLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>Why use rush mode?</Text>
          {BENEFITS.map((item) => (
            <View key={item.text} style={styles.benefitRow}>
              <View style={styles.benefitIconWrap}>
                <Ionicons name={item.icon} size={16} color={GatiMitraMerchant.navy} />
              </View>
              <Text style={styles.benefitText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {error ? (
          <Text style={styles.errorText} numberOfLines={3}>
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          disabled={!selectedId || saving || loading || !storeId || !token || rushActive}
          onPress={() => setConfirmVisible(true)}
          style={({ pressed }) => [
            styles.confirmBtn,
            (!selectedId || saving || loading || !storeId || !token || rushActive) &&
              styles.confirmBtnDisabled,
            pressed && selectedId && !saving && !rushActive && styles.confirmBtnPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmText}>
              {rushActive ? "Rush mode running" : `Start rush · ${selectedDurationLabel}`}
            </Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="flash" size={22} color="#FACC15" />
            </View>
            <Text style={styles.modalTitle}>Start rush mode?</Text>
            <Text style={styles.modalMessage}>
              Prep time will increase for {selectedDurationLabel}. Customers and riders will see a higher ETA on new orders.
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
                style={[styles.modalBtn, styles.modalBtnPrimary, saving && styles.modalBtnDisabled]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Yes, start</Text>
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
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    gap: 12,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusBannerActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  statusBannerOff: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderColor: GatiMitraMerchant.border,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#9CA3AF",
  },
  statusDotActive: {
    backgroundColor: "#FDE68A",
  },
  statusTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  statusTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  statusTitleActive: {
    color: "#FFFFFF",
  },
  statusSubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
  },
  statusSubtitleActive: {
    color: "rgba(255,255,255,0.88)",
  },
  mainCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 16,
    gap: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  cardHint: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.border,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: GatiMitraMerchant.textTertiary,
  },
  sectionHint: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginTop: -4,
  },
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  durationChip: {
    minWidth: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  durationChipActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
  },
  durationChipRunning: {
    borderColor: GatiMitraMerchant.primary,
    borderWidth: 2,
    borderRadius: 10,
  },
  durationChipPressed: { opacity: 0.85 },
  durationChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  durationChipTextActive: {
    color: GatiMitraMerchant.primary,
  },
  runningDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraMerchant.primary,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  activePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  benefitsCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 14,
    gap: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  benefitsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  benefitIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 12,
    color: GatiMitraMerchant.error,
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
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmBtnPressed: { opacity: 0.85 },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
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
    padding: 20,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  modalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEF9C3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 16,
    textAlign: "center",
    lineHeight: 19,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnSecondary: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  modalBtnPrimary: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  modalBtnDisabled: { opacity: 0.6 },
  modalBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  modalBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
