/**
 * Onboarding Step 2 – Permission modals (SMS → Notification → Location).
 * When denied/blocked, open app settings. Location required; skip location modal if already granted.
 */

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
  Pressable,
  Linking,
  Alert,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { profileService } from "@/services/profile.service";

async function requestNotificationPermission(): Promise<"granted" | "denied"> {
  try {
    const Constants = (await import("expo-constants")).default;
    if (Constants.appOwnership === "expo") return "granted";
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

function openAppSettings() {
  Linking.openSettings();
}

const BG = "#F8FAFC";
const OVERLAY = "rgba(0,0,0,0.5)";
const CARD_BG = "#FFFFFF";
const ACCENT = "#0D9488";
const ACCENT_LIGHT = "#CCFBF1";
const TITLE = "#0F172A";
const BODY = "#475569";
const BORDER = "#E2E8F0";

type PermissionStatus = "pending" | "granted" | "denied" | "skipped";

const PERMISSIONS = [
  {
    id: "sms" as const,
    icon: "chatbubble-outline" as const,
    title: "SMS Permission",
    subtitle: "Required for automatic OTP verification",
    description: "Automatically verify your login and receive instant order updates.",
  },
  {
    id: "notification" as const,
    icon: "notifications-outline" as const,
    title: "Notification Permission",
    subtitle: "Required for order updates and delivery alerts",
    description: "Get order updates and delivery alerts so you never miss a status change.",
  },
  {
    id: "location" as const,
    icon: "location-outline" as const,
    title: "Location Permission",
    subtitle: "Required to show nearby services and accurate delivery",
    description: "We use your location to find the fastest delivery and closest services. Please allow to continue.",
  },
] as const;

export default function OnboardingPermissionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [modalIndex, setModalIndex] = useState(0);
  const [status, setStatus] = useState<Record<string, PermissionStatus>>({
    sms: "pending",
    notification: "pending",
    location: "pending",
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [locationModalReady, setLocationModalReady] = useState(false);
  const didCheckLocationGranted = useRef(false);

  const allDone = modalIndex >= PERMISSIONS.length;
  const currentPermission = !allDone ? PERMISSIONS[modalIndex] : null;
  const isLocationStep = currentPermission?.id === "location";
  const showLocationModal = isLocationStep && locationModalReady;

  const permissionsToSave = useRef<{ sms: boolean; location: boolean; contacts: boolean } | null>(null);
  const didRunAllDone = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  // When we reach the location step: if already granted, skip modal and save lat/lon; else show modal
  useEffect(() => {
    if (!isLocationStep || didCheckLocationGranted.current) return;
    didCheckLocationGranted.current = true;
    (async () => {
      const { status: locStatus } = await Location.getForegroundPermissionsAsync();
      if (locStatus === "granted") {
        setStatus((s) => ({ ...s, location: "granted" }));
        permissionsToSave.current = {
          ...(permissionsToSave.current ?? {
            sms: status.sms === "granted",
            location: true,
            contacts: status.notification === "granted",
          }),
          location: true,
        };
        try {
          const { coords } = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          await profileService.updateProfile({
            location_permission: true,
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
        } catch {
          await profileService.updateProfile({ location_permission: true });
        }
        setModalIndex(PERMISSIONS.length);
      } else {
        setLocationModalReady(true);
      }
    })();
  }, [isLocationStep]);

  useEffect(() => {
    if (!allDone || didRunAllDone.current) return;
    didRunAllDone.current = true;
    let cancelled = false;
    (async () => {
      const p = permissionsToSave.current ?? {
        sms: status.sms === "granted",
        location: status.location === "granted",
        contacts: status.notification === "granted",
      };
      try {
        await profileService.updateProfile({
          sms_permission: p.sms,
          location_permission: p.location,
          contacts_permission: p.contacts,
        });
        if (!cancelled) router.replace("/(tabs)/");
      } catch {
        if (!cancelled) router.replace("/(tabs)/");
      }
    })();
    return () => { cancelled = true; };
  }, [allDone, status.sms, status.notification, status.location]);

  const updatePermissionsRef = (nextStatus: Record<string, PermissionStatus>) => {
    permissionsToSave.current = {
      sms: nextStatus.sms === "granted",
      location: nextStatus.location === "granted",
      contacts: nextStatus.notification === "granted",
    };
  };

  const goNext = () => {
    setModalIndex((i) => (i < PERMISSIONS.length - 1 ? i + 1 : PERMISSIONS.length));
  };

  const handleOpenSettings = (id: string) => {
    openAppSettings();
    Alert.alert(
      "Permission required",
      "Please enable this permission in Settings, then return to the app.",
      [{ text: "OK" }]
    );
  };

  // When user returns from Settings, re-check current permission; if granted, close modal and go to next
  useEffect(() => {
    if (!currentPermission || allDone) return;
    const permissionId = currentPermission.id;
    const subscription = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      if (nextState !== "active") return;
      setLoading(permissionId);
      try {
        const latestStatus = statusRef.current;
        if (permissionId === "location") {
          const { status: locStatus } = await Location.getForegroundPermissionsAsync();
          if (locStatus === "granted") {
            const next = { ...latestStatus, location: "granted" as const };
            setStatus(next);
            updatePermissionsRef(next);
            try {
              const { coords } = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              await profileService.updateProfile({
                location_permission: true,
                latitude: coords.latitude,
                longitude: coords.longitude,
              });
            } catch {
              await profileService.updateProfile({ location_permission: true });
            }
            goNext();
          }
        } else if (permissionId === "notification") {
          const Notifications = await import("expo-notifications");
          const { status: notifStatus } = await Notifications.getPermissionsAsync();
          if (notifStatus === "granted") {
            const next = { ...latestStatus, notification: "granted" as const };
            setStatus(next);
            updatePermissionsRef(next);
            goNext();
          }
        } else if (permissionId === "sms") {
          // SMS: no Expo API to check; assume user enabled in Settings and advance
          const next = { ...latestStatus, sms: "granted" as const };
          setStatus(next);
          updatePermissionsRef(next);
          goNext();
        }
      } finally {
        setLoading(null);
      }
    });
    return () => subscription.remove();
  }, [currentPermission?.id, allDone]);

  const handleAllow = async (id: string) => {
    setLoading(id);
    try {
      let next: Record<string, PermissionStatus>;
      if (id === "location") {
        const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
        next = { ...status, location: locStatus === "granted" ? "granted" : "denied" };
        setStatus(next);
        updatePermissionsRef(next);
        if (locStatus === "granted") {
          try {
            const { coords } = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            await profileService.updateProfile({
              location_permission: true,
              latitude: coords.latitude,
              longitude: coords.longitude,
            });
          } catch {
            await profileService.updateProfile({ location_permission: true });
          }
          goNext();
        } else {
          openAppSettings();
          Alert.alert(
            "Location required",
            "Please enable Location in Settings, then return to the app.",
            [{ text: "OK" }]
          );
        }
      } else if (id === "notification") {
        const notifStatus = await requestNotificationPermission();
        next = { ...status, notification: notifStatus };
        setStatus(next);
        updatePermissionsRef(next);
        if (notifStatus === "granted") {
          goNext();
        } else {
          handleOpenSettings("notification");
        }
      } else if (id === "sms") {
        // SMS permission cannot be requested in-app on Expo; open Settings. On return, AppState will re-check and goNext()
        openAppSettings();
        Alert.alert(
          "SMS permission",
          "To allow automatic OTP verification, enable SMS permission in Settings, then return to the app.",
          [{ text: "OK" }]
        );
        next = { ...status, sms: "pending" };
        setStatus(next);
        updatePermissionsRef(next);
      } else {
        next = { ...status, [id]: "granted" };
        setStatus(next);
        updatePermissionsRef(next);
        goNext();
      }
    } catch {
      const next = { ...status, [id]: "granted" };
      setStatus(next);
      updatePermissionsRef(next);
      goNext();
    } finally {
      setLoading(null);
    }
  };

  const handleSkip = (id: string) => {
    if (id === "location") return;
    const next = { ...status, [id]: "skipped" };
    setStatus(next);
    updatePermissionsRef(next);
    goNext();
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.subtitle}>We need a few permissions for a smooth and secure experience.</Text>
      </View>

      {currentPermission && (currentPermission.id !== "location" || showLocationModal) && (
        <Modal
          key={`permission-${modalIndex}-${currentPermission.id}`}
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
        >
          <Pressable style={styles.overlay} onPress={() => {}}>
            <Animated.View style={styles.modalCardWrap}>
              <View style={styles.modalCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderSpacer} />
                  {!isLocationStep && (
                    <TouchableOpacity
                      style={styles.skipBtn}
                      onPress={() => handleSkip(currentPermission.id)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Text style={styles.skipBtnText}>Skip</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.iconWrapCenter}>
                  <Ionicons name={currentPermission.icon} size={40} color={ACCENT} />
                </View>
                <Text style={styles.modalTitle}>{currentPermission.title}</Text>
                {currentPermission.subtitle ? (
                  <Text style={styles.modalSubtitle}>{currentPermission.subtitle}</Text>
                ) : null}
                <Text style={styles.modalDesc}>{currentPermission.description}</Text>
                <TouchableOpacity
                  style={[styles.allowBtn, loading === currentPermission.id && styles.allowBtnDisabled]}
                  onPress={() => handleAllow(currentPermission.id)}
                  disabled={!!loading}
                >
                  {loading === currentPermission.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.allowBtnText}>Allow</Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.settingsHint}>
                  If blocked, we'll open Settings so you can enable it.
                </Text>
              </View>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  overlay: {
    flex: 1,
    backgroundColor: OVERLAY,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCardWrap: { width: "100%", maxWidth: 400, alignSelf: "center" },
  modalCard: {
    backgroundColor: CARD_BG,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", width: "100%", marginBottom: 8 },
  cardHeaderSpacer: { flex: 1 },
  skipBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  skipBtnText: { fontSize: 14, color: BODY, fontWeight: "600" },
  iconWrapCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: TITLE, marginBottom: 4, textAlign: "center" },
  modalSubtitle: { fontSize: 13, color: BODY, marginBottom: 12, textAlign: "center" },
  modalDesc: { fontSize: 15, color: BODY, lineHeight: 22, textAlign: "center", marginBottom: 24, paddingHorizontal: 8 },
  allowBtn: {
    width: "100%",
    backgroundColor: ACCENT,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  allowBtnDisabled: { opacity: 0.8 },
  allowBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  settingsHint: { fontSize: 12, color: BODY, marginTop: 12, textAlign: "center" },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 40, justifyContent: "center" },
  subtitle: { fontSize: 16, color: BODY, lineHeight: 24, textAlign: "center", marginBottom: 32 },
});
