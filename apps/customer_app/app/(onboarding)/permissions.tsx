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
  Platform,
  PermissionsAndroid,
  type AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { profileService } from "@/services/profile.service";

async function requestSmsPermission(): Promise<"granted" | "denied"> {
  if (Platform.OS !== "android") return "granted";
  try {
    const read = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
    const receive = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
    return read === PermissionsAndroid.RESULTS.GRANTED &&
      receive === PermissionsAndroid.RESULTS.GRANTED
      ? "granted"
      : "denied";
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
    id: "contacts" as const,
    icon: "people-outline" as const,
    title: "Contacts Permission",
    subtitle: "Required to quickly invite and select saved contacts",
    description: "Allow contacts so we can help you pick recipients and share orders faster.",
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
    contacts: "pending",
    location: "pending",
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [allDoneSaved, setAllDoneSaved] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const allDone = modalIndex >= PERMISSIONS.length;
  const currentPermission = !allDone ? PERMISSIONS[modalIndex] : null;
  const permissionsToSave = useRef<{ sms: boolean; location: boolean; contacts: boolean }>({
    sms: false,
    location: false,
    contacts: false,
  });
  const didRunAllDone = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const syncPermissions = async (
    nextFlags: Partial<{ sms: boolean; location: boolean; contacts: boolean }>,
    coords?: { latitude: number; longitude: number }
  ) => {
    permissionsToSave.current = { ...permissionsToSave.current, ...nextFlags };
    await profileService.updateProfile({
      sms_permission: permissionsToSave.current.sms,
      location_permission: permissionsToSave.current.location,
      contacts_permission: permissionsToSave.current.contacts,
      ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
    });
  };

  const getHighAccuracyLocationWithRetry = async (): Promise<{ latitude: number; longitude: number } | null> => {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      Alert.alert("Turn on GPS", "Please enable device location services (GPS) and try again.");
      return null;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
          mayShowUserSettingsDialog: true,
        });
        if (
          coords &&
          Number.isFinite(coords.latitude) &&
          Number.isFinite(coords.longitude) &&
          (coords.accuracy == null || coords.accuracy <= 100)
        ) {
          return { latitude: coords.latitude, longitude: coords.longitude };
        }
      } catch {
        // Retry using fresh GPS fix.
      }
    }
    return null;
  };

  useEffect(() => {
    if (!allDone || didRunAllDone.current) return;
    didRunAllDone.current = true;
    let cancelled = false;
    (async () => {
      const p = permissionsToSave.current ?? {
        sms: status.sms === "granted",
        location: status.location === "granted",
        contacts: status.contacts === "granted",
      };
      try {
        setFinalizing(true);
        await profileService.updateProfile({
          sms_permission: p.sms,
          location_permission: p.location,
          contacts_permission: p.contacts,
        });
        if (!cancelled) setAllDoneSaved(true);
      } catch {
        if (!cancelled) setAllDoneSaved(true);
      } finally {
        if (!cancelled) setFinalizing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allDone, status.sms, status.contacts, status.location]);

  const updatePermissionsRef = (nextStatus: Record<string, PermissionStatus>) => {
    permissionsToSave.current = {
      sms: nextStatus.sms === "granted",
      location: nextStatus.location === "granted",
      contacts: nextStatus.contacts === "granted",
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
            const preciseLocation = await getHighAccuracyLocationWithRetry();
            await syncPermissions(
              { location: true },
              preciseLocation
                ? { latitude: preciseLocation.latitude, longitude: preciseLocation.longitude }
                : undefined
            );
            goNext();
          }
        } else if (permissionId === "contacts") {
          const { status: contactsStatus } = await Contacts.getPermissionsAsync();
          if (contactsStatus === "granted") {
            const next = { ...latestStatus, contacts: "granted" as const };
            setStatus(next);
            updatePermissionsRef(next);
            await syncPermissions({ contacts: true });
            goNext();
          }
        } else if (permissionId === "sms") {
          const smsStatus = await requestSmsPermission();
          if (smsStatus === "granted") {
            const next = { ...latestStatus, sms: "granted" as const };
            setStatus(next);
            updatePermissionsRef(next);
            await syncPermissions({ sms: true });
            goNext();
          }
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
          const preciseLocation = await getHighAccuracyLocationWithRetry();
          await syncPermissions(
            { location: true },
            preciseLocation
              ? { latitude: preciseLocation.latitude, longitude: preciseLocation.longitude }
              : undefined
          );
          goNext();
        } else {
          openAppSettings();
          Alert.alert(
            "Location required",
            "Please enable Location in Settings, then return to the app.",
            [{ text: "OK" }]
          );
        }
      } else if (id === "contacts") {
        const { status: contactsStatus } = await Contacts.requestPermissionsAsync();
        next = { ...status, contacts: contactsStatus === "granted" ? "granted" : "denied" };
        setStatus(next);
        updatePermissionsRef(next);
        if (contactsStatus === "granted") {
          await syncPermissions({ contacts: true });
          try {
            await Contacts.getContactsAsync({ pageSize: 1 });
          } catch {
            // DB flag was already synced.
          }
          goNext();
        } else {
          handleOpenSettings("contacts");
        }
      } else if (id === "sms") {
        const smsStatus = await requestSmsPermission();
        next = { ...status, sms: smsStatus };
        setStatus(next);
        updatePermissionsRef(next);
        if (smsStatus === "granted") {
          await syncPermissions({ sms: true });
          goNext();
        } else {
          handleOpenSettings("sms");
        }
      } else {
        next = { ...status, [id]: "granted" as PermissionStatus };
        setStatus(next);
        updatePermissionsRef(next);
        goNext();
      }
    } catch {
      const next = { ...status, [id]: "granted" as PermissionStatus };
      setStatus(next);
      updatePermissionsRef(next);
      goNext();
    } finally {
      setLoading(null);
    }
  };

  const handleSkip = (id: string) => {
    if (id === "location") return;
    const next = { ...status, [id]: "skipped" as PermissionStatus };
    setStatus(next);
    updatePermissionsRef(next);
    if (id === "sms") {
      void syncPermissions({ sms: false });
    } else if (id === "contacts") {
      void syncPermissions({ contacts: false });
    }
    goNext();
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.subtitle}>We need a few permissions for a smooth and secure experience.</Text>
      </View>

      {currentPermission && (
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
                  {currentPermission.id !== "location" && (
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

      {allDone && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <Pressable style={styles.overlay} onPress={() => {}}>
            <View style={styles.modalCardWrap}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>All set!</Text>
                <Text style={styles.modalDesc}>
                  Permissions were saved successfully. You can continue to the app now.
                </Text>
                <TouchableOpacity
                  style={[styles.allowBtn, (!allDoneSaved || finalizing) && styles.allowBtnDisabled]}
                  disabled={!allDoneSaved || finalizing}
                  onPress={() => router.replace("/(tabs)/")}
                >
                  {finalizing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.allowBtnText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
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
