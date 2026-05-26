import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  PanResponder,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getCommunicationSettings,
  updateCommunicationSettings,
  type CommunicationSettings,
} from "@/services/storeSettingsApi";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { useDeviceOrderAlerts } from "@/hooks/useDeviceOrderAlerts";
import {
  buildNotificationSoundOptions,
  resolveSelectedSoundSlot,
} from "@/lib/notificationSoundOptions";
import { patchOrderAcceptanceSoundSlot } from "@/services/orderAcceptanceApi";
import { previewOrderAlertSound } from "@/lib/playOrderAlertSound";

/** Offset from top of content area; use with insets so effective padding is never negative. */
const CONTENT_TOP_OFFSET = -20;
const MIN_TOP_PADDING = 8;

type CommState = CommunicationSettings;

const DEFAULT_STATE: CommState = {
  store_id: 0,
  whatsapp_notifications: false,
  reports: {
    daily_whatsapp: false,
    daily_email: false,
    weekly_whatsapp: false,
    weekly_email: false,
  },
  order_notifications: {
    enabled: true,
    ring_volume: 0.6,
    ring_in_silent: true,
  },
  live_complaint_notifications: false,
  rider_notifications: false,
};

export default function ManageCommunicationsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const queryClient = useQueryClient();
  const storeId = selectedStore?.id ?? null;

  const [settings, setSettings] = useState<CommState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [soundSaving, setSoundSaving] = useState(false);
  const [soundPreviewing, setSoundPreviewing] = useState(false);
  const { settings: acceptanceSettings } = useOrderAcceptanceSettings();
  const { deviceAlerts, update: updateDeviceAlerts } = useDeviceOrderAlerts(storeId);
  const [ringVolumePercent, setRingVolumePercent] = useState<number>(
    Math.round(DEFAULT_STATE.order_notifications.ring_volume * 100)
  );

  const notificationSoundOptions = useMemo(
    () => buildNotificationSoundOptions(acceptanceSettings.alert_sound_urls_by_slot ?? [null, null, null]),
    [acceptanceSettings.alert_sound_urls_by_slot]
  );

  const selectedSoundSlot = useMemo(() => {
    const deviceChoice = deviceAlerts?.alertSoundSlot ?? acceptanceSettings.alert_sound_slot_choice ?? 0;
    return resolveSelectedSoundSlot(notificationSoundOptions, deviceChoice);
  }, [
    acceptanceSettings.alert_sound_slot_choice,
    deviceAlerts?.alertSoundSlot,
    notificationSoundOptions,
  ]);

  const handleSelectNotificationSound = useCallback(
    async (slot: number) => {
      if (!storeId || !token || soundSaving) return;
      setSoundSaving(true);
      try {
        await patchOrderAcceptanceSoundSlot(storeId, token, slot);
        await updateDeviceAlerts({ alertSoundSlot: slot });
        await queryClient.invalidateQueries({ queryKey: ["orderAcceptanceSettings", storeId] });
        const volume01 = Math.min(
          1,
          Math.max(0, settings.order_notifications.ring_volume ?? ringVolumePercent / 100)
        );
        await previewOrderAlertSound({
          settings: acceptanceSettings,
          selectedSlot: slot,
          volume01,
        });
      } catch (e) {
        Alert.alert(
          "Could not update sound",
          e instanceof Error ? e.message : "Failed to update notification sound"
        );
      } finally {
        setSoundSaving(false);
      }
    },
    [
      storeId,
      token,
      soundSaving,
      updateDeviceAlerts,
      queryClient,
      settings.order_notifications.ring_volume,
      ringVolumePercent,
      acceptanceSettings,
    ]
  );

  const handlePreviewNotificationSound = useCallback(
    async (slotOverride?: number) => {
      if (soundPreviewing) return;
      setSoundPreviewing(true);
      try {
        const volume01 = Math.min(
          1,
          Math.max(0, settings.order_notifications.ring_volume ?? ringVolumePercent / 100)
        );
        const slot = slotOverride ?? selectedSoundSlot;
        const played = await previewOrderAlertSound({
          settings: acceptanceSettings,
          selectedSlot: slot,
          volume01,
        });
        if (!played) {
          Alert.alert(
            "Could not play sound",
            "Check your device media volume and try again."
          );
        }
      } finally {
        setSoundPreviewing(false);
      }
    },
    [
      acceptanceSettings,
      selectedSoundSlot,
      settings.order_notifications.ring_volume,
      ringVolumePercent,
      soundPreviewing,
    ]
  );

  const load = useCallback(async () => {
    if (!token || !storeId) {
      setSettings(DEFAULT_STATE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getCommunicationSettings(storeId, token);
      setSettings(s);
      setRingVolumePercent(Math.round(s.order_notifications.ring_volume * 100));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load communication settings";
      Alert.alert("Could not load", msg);
      setSettings((prev) => ({ ...DEFAULT_STATE, store_id: prev.store_id || storeId }));
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<CommState>, key: string) => {
      if (!token || !storeId) return;
      setSavingKey(key);
      const next: CommState = { ...settings, ...patch };
      setSettings(next);
      try {
        await updateCommunicationSettings(storeId, patch, token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to update settings";
        Alert.alert("Could not save changes", msg);
        void load();
      } finally {
        setSavingKey((k) => (k === key ? null : k));
      }
    },
    [token, storeId, settings, load]
  );

  const setTopLevel = (field: keyof CommState, value: boolean) => {
    void save({ [field]: value } as Partial<CommState>, String(field));
  };

  const setReport = (field: keyof CommState["reports"], value: boolean) => {
    const reports = { ...settings.reports, [field]: value };
    void save({ reports } as Partial<CommState>, `reports.${field}`);
  };

  const setOrder = (patch: Partial<CommState["order_notifications"]>, key: string) => {
    const order_notifications = { ...settings.order_notifications, ...patch };
    if (typeof order_notifications.ring_volume === "number") {
      setRingVolumePercent(Math.round(order_notifications.ring_volume * 100));
    }
    if (storeId) {
      const devicePatch: Partial<{ volumeStep: number; ringInSilent: boolean }> = {};
      if (typeof order_notifications.ring_volume === "number") {
        devicePatch.volumeStep = Math.max(
          0,
          Math.min(10, Math.round(order_notifications.ring_volume * 10))
        );
      }
      if (typeof order_notifications.ring_in_silent === "boolean") {
        devicePatch.ringInSilent = order_notifications.ring_in_silent;
      }
      if (Object.keys(devicePatch).length > 0) {
        void updateDeviceAlerts(devicePatch);
      }
    }
    void save({ order_notifications } as Partial<CommState>, `order.${key}`);
  };

  const adjustRingVolume = (delta: number) => {
    const next = Math.min(100, Math.max(0, ringVolumePercent + delta));
    setOrder({ ring_volume: next / 100 }, "ring_volume");
  };

  const isSaving = (key: string) => savingKey === key;

  const volumeTrackWidth = useRef(0);
  const dragVolumeRef = useRef(ringVolumePercent);

  useEffect(() => {
    dragVolumeRef.current = ringVolumePercent;
  }, [ringVolumePercent]);

  const updateVolumeFromX = (x: number) => {
    const width = volumeTrackWidth.current || 1;
    const ratio = Math.min(1, Math.max(0, x / width));
    const next = Math.round(ratio * 100);
    dragVolumeRef.current = next;
    setRingVolumePercent(next);
  };

  const volumePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 3,
      onPanResponderGrant: (evt) => {
        updateVolumeFromX(evt.nativeEvent.locationX);
      },
      onPanResponderMove: (evt) => {
        updateVolumeFromX(evt.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        const next = dragVolumeRef.current;
        setOrder({ ring_volume: next / 100 }, "ring_volume");
      },
      onPanResponderTerminate: () => {
        const next = dragVolumeRef.current;
        setOrder({ ring_volume: next / 100 }, "ring_volume");
      },
    })
  ).current;

  return (
    <View style={[styles.container, { paddingTop: Math.max(MIN_TOP_PADDING, insets.top + CONTENT_TOP_OFFSET) }]}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Manage communications</Text>
          {(loading || savingKey) && (
            <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
          )}
        </View>

        {/* WhatsApp notifications */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="logo-whatsapp" size={18} color="#22C55E" />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>WhatsApp notifications</Text>
              <Text style={styles.cardSubtitle}>
                Receive updates and reminders related to your restaurant on WhatsApp.
              </Text>
            </View>
            <Switch
              value={settings.whatsapp_notifications}
              onValueChange={(v) => setTopLevel("whatsapp_notifications", v)}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.whatsapp_notifications ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("whatsapp_notifications")}
            />
          </View>
        </View>

        {/* Business reports */}
        <Text style={styles.sectionLabel}>Business reports</Text>
        <View style={styles.card}>
          <Text style={styles.sectionSubTitle}>Daily reports</Text>
          <Text style={styles.sectionHint}>Every morning for previous day</Text>
          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="logo-whatsapp"
                size={16}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabel}>Share on WhatsApp</Text>
            </View>
            <Switch
              value={settings.reports.daily_whatsapp}
              onValueChange={(v) => setReport("daily_whatsapp", v)}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.reports.daily_whatsapp ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("reports.daily_whatsapp")}
            />
          </View>
          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="mail-outline"
                size={16}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabel}>Share on email</Text>
            </View>
            <Switch
              value={settings.reports.daily_email}
              onValueChange={(v) => setReport("daily_email", v)}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.reports.daily_email ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("reports.daily_email")}
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionSubTitle}>Weekly reports</Text>
          <Text style={styles.sectionHint}>Every Monday for previous week</Text>
          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="logo-whatsapp"
                size={16}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabel}>Share on WhatsApp</Text>
            </View>
            <Switch
              value={settings.reports.weekly_whatsapp}
              onValueChange={(v) => setReport("weekly_whatsapp", v)}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.reports.weekly_whatsapp ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("reports.weekly_whatsapp")}
            />
          </View>
          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="mail-outline"
                size={16}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabel}>Share on email</Text>
            </View>
            <Switch
              value={settings.reports.weekly_email}
              onValueChange={(v) => setReport("weekly_email", v)}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.reports.weekly_email ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("reports.weekly_email")}
            />
          </View>
        </View>

        {/* Order notifications */}
        <Text style={styles.sectionLabel}>Order notifications</Text>
        <View style={styles.card}>
          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="notifications-outline"
                size={18}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabelStrong}>Order notifications</Text>
            </View>
            <Switch
              value={settings.order_notifications.enabled}
              onValueChange={(v) => setOrder({ enabled: v }, "enabled")}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.order_notifications.enabled ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("order.enabled")}
            />
          </View>
          <Text style={styles.sectionHint}>
            Receive order notifications on this device.
          </Text>

          <View style={styles.volumeRow}>
            <Text style={styles.rowLabelStrong}>Ring volume</Text>
            <Text style={styles.volumeValue}>{ringVolumePercent}%</Text>
          </View>
          <View style={styles.volumeBarRow}>
            <View
              style={styles.volumeBarTrack}
              onLayout={(e) => {
                volumeTrackWidth.current = e.nativeEvent.layout.width;
              }}
              {...volumePanResponder.panHandlers}
            >
              <View
                style={[
                  styles.volumeBarFill,
                  { width: `${ringVolumePercent}%` },
                ]}
              />
            </View>
            <View style={styles.volumeButtons}>
              <Text style={styles.volumeButton} onPress={() => adjustRingVolume(-20)}>
                −
              </Text>
              <Text style={styles.volumeButton} onPress={() => adjustRingVolume(20)}>
                +
              </Text>
            </View>
          </View>

          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="volume-mute-outline"
                size={18}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabel}>Ring in silent mode</Text>
            </View>
            <Switch
              value={settings.order_notifications.ring_in_silent}
              onValueChange={(v) => setOrder({ ring_in_silent: v }, "ring_in_silent")}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.order_notifications.ring_in_silent ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("order.ring_in_silent")}
            />
          </View>
        </View>

        {/* Incoming order alert sound — platform uploads + per-store choice */}
        <Text style={styles.sectionLabel}>Order alert sound</Text>
        <View style={styles.card}>
          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="musical-notes-outline"
                size={18}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabelStrong}>Sound alerts on this device</Text>
            </View>
            <Switch
              value={deviceAlerts?.soundAlertsEnabled !== false}
              onValueChange={(v) => void updateDeviceAlerts({ soundAlertsEnabled: v })}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={deviceAlerts?.soundAlertsEnabled !== false ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId}
            />
          </View>
          <Text style={styles.sectionHint}>
            Plays when a new order arrives and the incoming order sheet opens.
          </Text>

          {notificationSoundOptions.length === 0 ? (
            <Text style={[styles.sectionHint, { marginTop: 10 }]}>
              No alert sounds configured yet. Ask admin to upload notification sounds for your store type.
            </Text>
          ) : (
            <>
              <Text style={[styles.rowLabelStrong, { marginTop: 14, marginBottom: 8 }]}>
                Select notification sound
              </Text>
              {notificationSoundOptions.map((opt) => {
                const active = selectedSoundSlot === opt.slot;
                return (
                  <View
                    key={opt.slot}
                    style={[styles.soundOptionRow, active && styles.soundOptionRowActive]}
                  >
                    <Pressable
                      onPress={() => void handleSelectNotificationSound(opt.slot)}
                      disabled={!storeId || soundSaving}
                      style={({ pressed }) => [
                        styles.soundOptionMain,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name={active ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={active ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
                      />
                      <Text style={[styles.soundOptionLabel, active && styles.soundOptionLabelActive]}>
                        {opt.label}
                      </Text>
                      {soundSaving && active ? (
                        <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
                      ) : null}
                    </Pressable>
                    <Pressable
                      onPress={() => void handlePreviewNotificationSound(opt.slot)}
                      disabled={!storeId || soundPreviewing || deviceAlerts?.soundAlertsEnabled === false}
                      hitSlop={8}
                      style={({ pressed }) => [styles.soundOptionPlay, pressed && styles.pressed]}
                    >
                      <Ionicons
                        name="play-circle-outline"
                        size={22}
                        color={
                          deviceAlerts?.soundAlertsEnabled === false
                            ? GatiMitraMerchant.textTertiary
                            : GatiMitraMerchant.primary
                        }
                      />
                    </Pressable>
                  </View>
                );
              })}
              <Pressable
                onPress={() => void handlePreviewNotificationSound()}
                disabled={!storeId || soundPreviewing || deviceAlerts?.soundAlertsEnabled === false}
                style={({ pressed }) => [
                  styles.previewBtn,
                  pressed && styles.pressed,
                  (soundPreviewing || deviceAlerts?.soundAlertsEnabled === false) && styles.previewBtnDisabled,
                ]}
              >
                <Ionicons name="play-circle-outline" size={18} color={GatiMitraMerchant.primary} />
                <Text style={styles.previewBtnText}>
                  {soundPreviewing ? "Playing…" : "Preview selected sound"}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Other notifications */}
        <View style={styles.card}>
          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="chatbubbles-outline"
                size={18}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabelStrong}>Live complaint notifications</Text>
            </View>
            <Switch
              value={settings.live_complaint_notifications}
              onValueChange={(v) => setTopLevel("live_complaint_notifications", v)}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.live_complaint_notifications ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("live_complaint_notifications")}
            />
          </View>
          <Text style={styles.sectionHint}>
            Receive a notification whenever a customer raises a complaint on an order.
          </Text>

          <View style={styles.divider} />

          <View style={styles.rowToggle}>
            <View style={styles.rowLabelWrap}>
              <Ionicons
                name="bicycle-outline"
                size={18}
                color={GatiMitraMerchant.primary}
                style={styles.rowIcon}
              />
              <Text style={styles.rowLabelStrong}>Rider notifications</Text>
            </View>
            <Switch
              value={settings.rider_notifications}
              onValueChange={(v) => setTopLevel("rider_notifications", v)}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.rider_notifications ? "#FFFFFF" : "#F9FAFB"}
              disabled={!storeId || isSaving("rider_notifications")}
            />
          </View>
          <Text style={styles.sectionHint}>
            Get alerts when your rider is assigned, delayed or changes status.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 24,
    paddingTop: 4,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: H_PADDING,
  },
  sectionSubTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  sectionHint: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
    marginBottom: 6,
  },
  card: {
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  rowToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  rowLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  rowIcon: {
    marginRight: 2,
  },
  rowLabel: {
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
  },
  rowLabelStrong: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: GatiMitraMerchant.divider,
    marginVertical: 8,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 4,
  },
  volumeValue: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  volumeBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  volumeBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    overflow: "hidden",
  },
  volumeBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  volumeButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  volumeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: "center",
    textAlignVertical: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    color: GatiMitraMerchant.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  soundOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  soundOptionMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  soundOptionPlay: {
    padding: 4,
  },
  soundOptionRowActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFDF5",
  },
  soundOptionLabel: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
  },
  soundOptionLabelActive: {
    fontWeight: "700",
    color: GatiMitraMerchant.primaryDark,
  },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#F0FDF4",
  },
  previewBtnDisabled: {
    opacity: 0.5,
  },
  previewBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.primaryDark,
  },
  pressed: {
    opacity: 0.75,
  },
});

