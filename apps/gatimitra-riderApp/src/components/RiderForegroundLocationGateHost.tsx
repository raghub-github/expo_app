import React, { useEffect, useRef, useState, useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { useForegroundLocationPermissionStore } from "@/src/stores/foregroundLocationPermissionStore";
import {
  ensureForegroundLocationForAuthenticatedEntry,
  hasAttemptedNativeLocationRequest,
  openForegroundLocationSettings,
  reconcileForegroundLocationPermission,
  wireForegroundLocationPermissionAppStateOnce,
} from "@/src/lib/riderForegroundLocationGate";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

/**
 * Authenticated FG location gate.
 *
 * Always triggers the native OS dialog first.
 * Custom Settings card only after a native request was attempted and OS still blocks.
 */
export function RiderForegroundLocationGateHost() {
  const { t } = useTranslation();
  const hasSession = useSessionStore((s) => Boolean(s.session));
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const { canAccessTabs, ready: onboardingReady } = useOnboardingGate();
  const phase = useForegroundLocationPermissionStore((s) => s.phase);
  const [busy, setBusy] = useState(false);
  const [nativeTried, setNativeTried] = useState(false);
  const entryPromptStarted = useRef(false);

  const active =
    sessionHydrated && hasSession && onboardingReady && canAccessTabs;

  useEffect(() => {
    return wireForegroundLocationPermissionAppStateOnce();
  }, []);

  useEffect(() => {
    if (!active) {
      entryPromptStarted.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = await reconcileForegroundLocationPermission();
      if (cancelled) return;
      if (next === "GRANTED") return;
      // Always attempt native OS dialog — including when get() said canAskAgain=false.
      if (entryPromptStarted.current && hasAttemptedNativeLocationRequest()) {
        setNativeTried(true);
        return;
      }
      entryPromptStarted.current = true;
      await ensureForegroundLocationForAuthenticatedEntry();
      if (!cancelled) setNativeTried(hasAttemptedNativeLocationRequest());
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  // If phase becomes requestable again (revoke) and we need another prompt.
  useEffect(() => {
    if (!active) return;
    if (phase !== "REQUESTABLE" && phase !== "DENIED") return;
    if (hasAttemptedNativeLocationRequest() && phase === "REQUESTABLE") {
      // After Don't allow while still askable — do not auto-loop; Duty can force.
      return;
    }
  }, [active, phase]);

  const onOpenSettings = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openForegroundLocationSettings();
    } finally {
      setBusy(false);
      void reconcileForegroundLocationPermission();
    }
  }, [busy]);

  if (!active) return null;
  if (phase === "GRANTED") return null;

  // While checking / requesting — dim only. Native dialog sits on top.
  if (
    phase === "UNKNOWN" ||
    phase === "CHECKING" ||
    phase === "REQUESTING" ||
    (!nativeTried && !hasAttemptedNativeLocationRequest())
  ) {
    return (
      <View style={styles.dim} pointerEvents="auto">
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  // Settings fallback ONLY after native request was attempted and OS still blocks.
  if (
    phase === "BLOCKED_OR_SETTINGS_REQUIRED" &&
    (nativeTried || hasAttemptedNativeLocationRequest())
  ) {
    return (
      <View style={styles.overlay} pointerEvents="auto">
        <View style={styles.card}>
          <Text style={styles.title}>
            {t("location.permissionRequired", "Location permission required")}
          </Text>
          <Text style={styles.sub}>
            {t(
              "location.permissionBlockedMessage",
              "Location access is turned off for this app. Open Settings, enable Location, then return here."
            )}
          </Text>
          <Button
            onPress={() => void onOpenSettings()}
            style={{ marginTop: 16 }}
            disabled={busy}
          >
            {t("location.openSettings", "Open Settings")}
          </Button>
        </View>
      </View>
    );
  }

  // Denied but still askable (or waiting): no custom Settings modal.
  return null;
}

const styles = StyleSheet.create({
  dim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 2000,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "stretch",
  },
  title: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    textAlign: "center",
  },
});
