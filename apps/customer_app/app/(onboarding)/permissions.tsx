import { useState, useEffect, useRef } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Pressable, Linking, Alert, AppState, type AppStateStatus } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import Constants from "expo-constants";
import {
  createPushPermissionController,
  type PushPermissionController,
} from "@gatimitra/expo-push-kit";
import { profileService } from "@/services/profile.service";
import {
  getContactsPermissionGranted,
  getSmsPermissionGranted,
} from "@/lib/device-permissions";
import { runSmsAllowPipeline, isSmsReadPermissionApplicable } from "@/lib/smsPermissionManager";
import { SmsPermissionBottomSheet } from "@/components/SmsPermissionBottomSheet";
import { PermissionPromptBottomSheet } from "@/components/permissions/PermissionPromptBottomSheet";
import { getNetworkErrorMessage } from "@/utils/networkError";
import { useAuthStore } from "@/store/authStore";
import { getConfig } from "@/config/env";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";

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
  {
    id: "notifications" as const,
    icon: "notifications-outline" as const,
    title: "Notification Permission",
    subtitle: "Required for order and delivery updates",
    description: "Allow notifications so you never miss order status, rider updates, or important offers.",
  },
] as const;

export default function OnboardingPermissionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const [modalIndex, setModalIndex] = useState(0);
  const [status, setStatus] = useState<Record<string, PermissionStatus>>({
    sms: "pending",
    contacts: "pending",
    location: "pending",
    notifications: "pending",
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [allDoneSaved, setAllDoneSaved] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  /** Hide SMS Modal before system dialog — otherwise Android request hangs under RN Modal. */
  const [smsSheetVisible, setSmsSheetVisible] = useState(true);

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
  const pushControllerRef = useRef<PushPermissionController | null>(null);

  useEffect(() => {
    const { apiBaseUrl } = getConfig();
    pushControllerRef.current = createPushPermissionController({
      apiBaseUrl,
      androidPackageName: Constants.expoConfig?.android?.package,
      androidChannels: [
        { channelId: "default", name: "Orders & updates", lightColor: "#14b8a6" },
        { channelId: "customer_default", name: "Orders & updates", lightColor: "#14b8a6" },
      ],
      getAuth: () => {
        if (!session?.accessToken || session.role !== "customer") return null;
        return { accessToken: session.accessToken, role: "customer" };
      },
    });
    return () => {
      pushControllerRef.current?.stopLifecycle();
      pushControllerRef.current = null;
    };
  }, [session?.accessToken, session?.role]);

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
    setSmsSheetVisible(true);
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
          const contactsGranted = await getContactsPermissionGranted();
          if (contactsGranted) {
            const next = { ...latestStatus, contacts: "granted" as const };
            setStatus(next);
            updatePermissionsRef(next);
            await syncPermissions({ contacts: true });
            goNext();
          }
        } else if (permissionId === "sms") {
          const smsGranted = await getSmsPermissionGranted();
          if (smsGranted) {
            const next = { ...latestStatus, sms: "granted" as const };
            setStatus(next);
            updatePermissionsRef(next);
            useSmsPermissionStore.setState({
              granted: true,
              showSheet: false,
              blocksLocation: false,
            });
            await syncPermissions({ sms: true });
            goNext();
          } else {
            setSmsSheetVisible(true);
          }
        } else if (permissionId === "notifications") {
          const snap = await pushControllerRef.current?.refresh({ syncIfGranted: true });
          if (snap?.osStatus === "granted" && snap.lastBackendSyncOk !== false) {
            const next = { ...latestStatus, notifications: "granted" as const };
            setStatus(next);
            goNext();
          }
        }
      } finally {
        setLoading(null);
      }
    });
    return () => subscription.remove();
  }, [currentPermission?.id, allDone]);

  useEffect(() => {
    // Expo Go / iOS: READ_SMS not applicable — auto-complete SMS step, never Settings.
    if (currentPermission?.id !== "sms") return;
    if (isSmsReadPermissionApplicable()) return;
    const next = { ...statusRef.current, sms: "granted" as const };
    setStatus(next);
    updatePermissionsRef(next);
    useSmsPermissionStore.setState({
      granted: true,
      showSheet: false,
      blocksLocation: false,
      allowInFlight: false,
    });
    void syncPermissions({ sms: true });
    goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when landing on SMS step
  }, [currentPermission?.id]);

  useEffect(() => {
    // Expo Go cannot register remote push tokens (SDK 53+). Skip the OS prompt
    // so onboarding is not blocked; in-app inbox banners still work after login.
    if (currentPermission?.id !== "notifications") return;
    if (Constants.appOwnership !== "expo") return;
    const next = { ...statusRef.current, notifications: "granted" as const };
    setStatus(next);
    updatePermissionsRef(next);
    goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Expo Go one-shot
  }, [currentPermission?.id]);

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
        setSmsSheetVisible(false);
        setLoading(null);
        useSmsPermissionStore.getState().beginSmsAllowRequest();
        try {
          // Fresh check first — if already OK / N/A, never open Settings.
          const alreadyOk = await getSmsPermissionGranted();
          if (alreadyOk) {
            next = { ...status, sms: "granted" };
            setStatus(next);
            updatePermissionsRef(next);
            useSmsPermissionStore.setState({
              granted: true,
              showSheet: false,
              blocksLocation: false,
              allowInFlight: false,
            });
            void syncPermissions({ sms: true });
            goNext();
            return;
          }

          const smsResult = await runSmsAllowPipeline({
            openSettingsOnPermanentDeny: !useSmsPermissionStore.getState().settingsRedirectUsed,
          });
          const ok =
            smsResult.status === "granted" ||
            smsResult.status === "skipped" ||
            smsResult.notApplicable;
          next = { ...status, sms: ok ? "granted" : "denied" };
          setStatus(next);
          updatePermissionsRef(next);
          if (ok) {
            useSmsPermissionStore.setState({
              granted: true,
              showSheet: false,
              blocksLocation: false,
              allowInFlight: false,
            });
            void syncPermissions({ sms: true });
            goNext();
          } else if (smsResult.openedSettings) {
            useSmsPermissionStore.setState({ settingsRedirectUsed: true });
            // AppState listener re-checks fresh OS status on return.
          } else {
            setSmsSheetVisible(true);
          }
        } finally {
          useSmsPermissionStore.getState().endSmsAllowRequest();
        }
      } else if (id === "notifications") {
        const result = await pushControllerRef.current?.requestOrOpenSettings();
        if (result?.granted) {
          // Wait for token sync success before advancing.
          let snap = result.snapshot;
          if (snap.syncStatus === "syncing" || snap.lastBackendSyncOk == null) {
            snap = (await pushControllerRef.current?.syncTokens()) ?? snap;
          }
          if (snap.osStatus === "granted") {
            next = { ...status, notifications: "granted" };
            setStatus(next);
            goNext();
          } else {
            next = { ...status, notifications: "denied" };
            setStatus(next);
          }
        } else {
          next = { ...status, notifications: "denied" };
          setStatus(next);
          if (!result?.openedSettings) {
            Alert.alert(
              "Notifications required",
              "Please enable notifications in Settings, then return to the app.",
              [{ text: "OK" }]
            );
          }
        }
      } else {
        next = { ...status, [id]: "granted" as PermissionStatus };
        setStatus(next);
        updatePermissionsRef(next);
        goNext();
      }
    } catch (err) {
      Alert.alert("Could not save settings", getNetworkErrorMessage(err));
    } finally {
      setLoading(null);
    }
  };

  const handleSkip = (id: string) => {
    if (id === "location" || id === "notifications") return;
    const next = { ...status, [id]: "skipped" as PermissionStatus };
    setStatus(next);
    updatePermissionsRef(next);
    if (id === "sms") {
      useSmsPermissionStore.setState({
        showSheet: false,
        dismissedThisSession: true,
        granted: false,
        blocksLocation: false,
      });
      void syncPermissions({ sms: false });
    } else if (id === "contacts") {
      void syncPermissions({ contacts: false });
    }
    goNext();
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <AppText style={styles.subtitle}>We need a few permissions for a smooth and secure experience.</AppText>
      </View>

      {/* One step at a time — never stack permission sheets. */}
      {currentPermission?.id === "sms" && smsSheetVisible ? (
        <SmsPermissionBottomSheet
          key="step-sms"
          visible
          loading={false}
          onAllow={() => handleAllow("sms")}
          onSkip={() => handleSkip("sms")}
        />
      ) : null}

      {currentPermission &&
      (currentPermission.id === "contacts" ||
        currentPermission.id === "location" ||
        currentPermission.id === "notifications") ? (
        <PermissionPromptBottomSheet
          key={`step-${currentPermission.id}`}
          visible
          icon={currentPermission.icon}
          title={currentPermission.title}
          message={currentPermission.description}
          loading={loading === currentPermission.id}
          mandatory={
            currentPermission.id === "location" || currentPermission.id === "notifications"
          }
          onAllow={() => handleAllow(currentPermission.id)}
          onSkip={
            currentPermission.id === "contacts"
              ? () => handleSkip("contacts")
              : undefined
          }
          skipLabel="Skip"
        />
      ) : null}

      {allDone && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <Pressable style={styles.overlay} onPress={() => {}}>
            <View style={styles.modalCardWrap}>
              <View style={styles.modalCard}>
                <AppText style={styles.modalTitle}>All set!</AppText>
                <AppText style={styles.modalDesc}>
                  Permissions were saved successfully. You can continue to the app now.
                </AppText>
                <TouchableOpacity
                  style={[styles.allowBtn, (!allDoneSaved || finalizing) && styles.allowBtnDisabled]}
                  disabled={!allDoneSaved || finalizing}
                  onPress={() => router.replace("/(tabs)/")}
                >
                  {finalizing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <AppText style={styles.allowBtnText}>Continue</AppText>
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
