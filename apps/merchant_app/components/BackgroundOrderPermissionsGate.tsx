/**
 * Android background-wake permission sheets — same curved UI as the notification
 * permission sheet. Opens after notifications are granted (real system Settings).
 *
 * Battery / overlay “Allow” completions are persisted in SecureStore so the sheet
 * does not reappear every cold start / AppState resume after the user already acted.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { AppState, Platform, Pressable, StyleSheet, View, type AppStateStatus } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import {
  openMerchantBatteryOptimizationSettings,
  openMerchantDisplayOverAppsSettings,
  readMerchantBatteryUnrestricted,
} from "@/lib/androidBackgroundPermissions";
import { useAuth } from "@/context/AuthContext";
import { useNotificationPermissionGate } from "@/context/NotificationPermissionGateContext";
import { readMerchantNotificationPermission } from "@/lib/merchantNotificationPermission";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const MERCHANT_TEAL = "#0D9488";
const OVERLAY_HINT_KEY = "mx_overlay_permission_hint_v2";
/** User completed (or dismissed) the battery unrestricted prompt — do not nag again. */
const BATTERY_HINT_KEY = "mx_battery_permission_hint_v2";

type Step = "battery" | "overlay";

type StepCopy = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  step1: string;
  step2: string;
};

const COPY: Record<Step, StepCopy> = {
  battery: {
    icon: "battery-charging",
    title: "Allow background running",
    body:
      "Turn off battery optimization so GatiMitra Partner can wake and open for new orders — even when the app is closed or the screen is off.",
    step1: "Tap Allow below",
    step2: "Choose Allow / Unrestricted for GatiMitra Partner",
  },
  overlay: {
    icon: "layers-outline",
    title: "Allow display over other apps",
    body:
      "Allow GatiMitra Partner to appear over other apps so a new order can open the accept screen automatically.",
    step1: "Tap Allow below",
    step2: "Turn on “Display over other apps” for GatiMitra Partner",
  },
};

export default function BackgroundOrderPermissionsGate() {
  const { token, isAuthenticated } = useAuth();
  const { notificationsGranted, bgGateNonce, setNotificationsGranted } =
    useNotificationPermissionGate();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionDismissedRef = useRef(false);
  const evaluatingRef = useRef(false);
  const bothDoneRef = useRef(false);

  const loggedIn = Boolean(token || isAuthenticated);

  const evaluate = useCallback(async () => {
    if (Platform.OS !== "android" || !loggedIn || sessionDismissedRef.current || bothDoneRef.current) {
      return;
    }
    if (evaluatingRef.current) return;
    evaluatingRef.current = true;
    try {
      const notif = await readMerchantNotificationPermission();
      const granted = notif.osStatus === "granted";
      setNotificationsGranted(granted);
      if (!granted) {
        setStep(null);
        return;
      }

      const unrestricted = await readMerchantBatteryUnrestricted();
      const batteryHint = await SecureStore.getItemAsync(BATTERY_HINT_KEY);
      const batteryDone =
        unrestricted === true || batteryHint === "granted" || batteryHint === "dismissed";

      if (!batteryDone) {
        setStep("battery");
        return;
      }

      // OEM reported unrestricted — lock the hint so we never re-ask.
      if (unrestricted === true && batteryHint !== "granted") {
        await SecureStore.setItemAsync(BATTERY_HINT_KEY, "granted").catch(() => undefined);
      }

      const overlayHint = await SecureStore.getItemAsync(OVERLAY_HINT_KEY);
      if (overlayHint !== "granted" && overlayHint !== "dismissed") {
        setStep("overlay");
        return;
      }

      bothDoneRef.current = true;
      setStep(null);
    } finally {
      evaluatingRef.current = false;
    }
  }, [loggedIn, setNotificationsGranted]);

  useEffect(() => {
    if (!loggedIn || Platform.OS !== "android") {
      setStep(null);
      return;
    }
    void evaluate();
  }, [loggedIn, evaluate, notificationsGranted, bgGateNonce]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active" && loggedIn && Platform.OS === "android") {
        void evaluate();
      }
    });
    return () => sub.remove();
  }, [loggedIn, evaluate]);

  const dismiss = () => {
    sessionDismissedRef.current = true;
    const current = step;
    setStep(null);
    // Persist dismiss so cold starts don't keep nagging the same sheet.
    void (async () => {
      try {
        if (current === "battery") {
          await SecureStore.setItemAsync(BATTERY_HINT_KEY, "dismissed");
        } else if (current === "overlay") {
          await SecureStore.setItemAsync(OVERLAY_HINT_KEY, "dismissed");
        }
      } catch {
        /* ignore */
      }
    })();
  };

  const onAllow = async () => {
    if (!step) return;
    setBusy(true);
    try {
      if (step === "battery") {
        await openMerchantBatteryOptimizationSettings("request");
        // Persist immediately so returning from Settings / remount never re-opens battery sheet.
        await SecureStore.setItemAsync(BATTERY_HINT_KEY, "granted");
        setStep("overlay");
        return;
      }
      await openMerchantDisplayOverAppsSettings();
      await SecureStore.setItemAsync(OVERLAY_HINT_KEY, "granted");
      bothDoneRef.current = true;
      setStep(null);
    } finally {
      setBusy(false);
    }
  };

  const copy = step ? COPY[step] : null;
  const showGate = loggedIn && Platform.OS === "android" && step != null && copy != null;

  return (
    <PermissionBottomSheetShell visible={showGate} dismissible onDismiss={dismiss}>
      {copy ? (
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name={copy.icon} size={32} color={MERCHANT_TEAL} />
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>What to do</Text>
            <View style={styles.noteRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={styles.noteText}>{copy.step1}</Text>
            </View>
            <View style={styles.noteRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <Text style={styles.noteText}>{copy.step2}</Text>
            </View>
          </View>

          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={() => void onAllow()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Allow"
          >
            <Text style={styles.btnText}>{busy ? "Please wait…" : "Allow"}</Text>
          </Pressable>

          <Pressable style={styles.later} onPress={dismiss} hitSlop={8}>
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </View>
      ) : null}
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconWrap: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(13, 148, 136, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    fontFamily: LORA,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
    marginBottom: 18,
  },
  noteBox: {
    backgroundColor: "#F0FDFA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  noteTitle: {
    fontSize: 12,
    fontFamily: LORA_BOLD,
    color: MERCHANT_TEAL,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MERCHANT_TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: LORA_BOLD,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: LORA,
    color: "#334155",
    lineHeight: 19,
  },
  btn: {
    backgroundColor: MERCHANT_TEAL,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F766E",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: "#FFFFFF",
    fontFamily: LORA_BOLD,
    fontSize: 16,
  },
  later: { alignItems: "center", paddingVertical: 14 },
  laterText: {
    color: "#64748B",
    fontSize: 14,
    fontFamily: LORA_BOLD,
  },
});
