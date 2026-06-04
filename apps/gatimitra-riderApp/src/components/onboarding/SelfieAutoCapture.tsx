import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { validateSelfieFace } from "@/src/lib/selfie-face-validation";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const RING_SIZE = 200;
const AUTO_CAPTURE_COUNTDOWN_SEC = 3;

type CaptureStatus =
  | "permission"
  | "starting"
  | "searching"
  | "countdown"
  | "capturing"
  | "done";

export function SelfieAutoCapture({
  uri,
  active,
  disabled,
  onCaptured,
  onRemove,
  onRejected,
  hint,
  tips,
}: {
  uri: string | null;
  active: boolean;
  disabled?: boolean;
  onCaptured: (uri: string) => void | Promise<void>;
  onRemove: () => void;
  onRejected?: (message: string) => void;
  hint: string;
  tips: readonly string[];
}) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<CaptureStatus>("starting");
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const capturingRef = useRef(false);
  const countdownStartedRef = useRef(false);

  const captureFinal = useCallback(async () => {
    if (capturingRef.current || disabled || uri) return;
    capturingRef.current = true;
    setStatus("capturing");
    setCountdown(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
        shutterSound: false,
      });
      if (photo?.uri) {
        const validation = await validateSelfieFace(photo.uri);
        if (!validation.ok) {
          setRejection(validation.message);
          onRejected?.(validation.message);
          setStatus("searching");
          countdownStartedRef.current = false;
          return;
        }
        setRejection(null);
        await onCaptured(photo.uri);
        setStatus("done");
      } else {
        setStatus("searching");
        countdownStartedRef.current = false;
      }
    } catch {
      setStatus("searching");
      countdownStartedRef.current = false;
    } finally {
      capturingRef.current = false;
    }
  }, [disabled, onCaptured, onRejected, uri]);

  useEffect(() => {
    if (!active || uri || disabled) return;
    if (!permission) return;

    if (!permission.granted) {
      setStatus("permission");
      void requestPermission();
      return;
    }

    setStatus(cameraReady ? "searching" : "starting");
  }, [active, uri, disabled, permission, requestPermission, cameraReady]);

  // Auto countdown capture once camera is live (no native face-detector required).
  useEffect(() => {
    if (!active || uri || disabled || !permission?.granted || !cameraReady) return;
    if (countdownStartedRef.current) return;

    countdownStartedRef.current = true;
    setStatus("countdown");
    setCountdown(AUTO_CAPTURE_COUNTDOWN_SEC);

    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(tick);
          void captureFinal();
          return null;
        }
        setStatus("countdown");
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(tick);
    };
  }, [active, uri, disabled, permission?.granted, cameraReady, captureFinal]);

  useEffect(() => {
    if (uri) return;
    countdownStartedRef.current = false;
    setCountdown(null);
    setRejection(null);
    if (!active) {
      setCameraReady(false);
    }
  }, [uri, active]);

  const statusLabel =
    status === "permission"
      ? "Allow camera access to continue"
      : status === "starting"
        ? "Starting camera…"
        : status === "countdown" && countdown !== null
          ? `Hold still — ${countdown}`
          : status === "searching"
            ? "Center your face in the circle"
            : status === "capturing"
              ? "Capturing…"
              : "Selfie captured";

  return (
    <View style={styles.section}>
      <Text style={styles.hint}>{hint}</Text>

      {rejection ? (
        <View style={styles.rejectionBanner}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error[600]} />
          <Text style={styles.rejectionText}>{rejection}</Text>
        </View>
      ) : null}

      <View style={styles.ringWrap}>
        <View style={[styles.ring, uri ? styles.ringFilled : null]}>
          {uri ? (
            <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
          ) : permission?.granted ? (
            <>
              <CameraView
                ref={cameraRef}
                facing="front"
                mode="picture"
                mirror
                style={styles.camera}
                onCameraReady={() => setCameraReady(true)}
              />
              <View style={styles.ringOverlay} pointerEvents="none">
                <View style={styles.ringGuide} />
                {countdown !== null && countdown > 0 ? (
                  <View style={styles.countdownBadge}>
                    <Text style={styles.countdownText}>{countdown}</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.permissionFallback}>
              {status === "permission" ? (
                <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}>
                  <Ionicons name="camera-outline" size={22} color="#ffffff" />
                  <Text style={styles.permissionBtnText}>Enable Camera</Text>
                </Pressable>
              ) : (
                <ActivityIndicator color={ACCENT_DARK} />
              )}
            </View>
          )}
        </View>

        {!uri && permission?.granted ? (
          <View style={styles.statusPill} pointerEvents="none">
            {status === "capturing" || status === "starting" ? (
              <ActivityIndicator size="small" color={ACCENT_DARK} />
            ) : (
              <View
                style={[
                  styles.statusDot,
                  status === "countdown" ? styles.statusDotReady : null,
                ]}
              />
            )}
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        ) : null}

        {!uri && permission?.granted && status !== "capturing" ? (
          <Pressable
            onPress={() => void captureFinal()}
            disabled={disabled || !cameraReady}
            style={({ pressed }) => [
              styles.manualCaptureBtn,
              pressed && styles.manualCaptureBtnPressed,
              (disabled || !cameraReady) && styles.manualCaptureBtnDisabled,
            ]}
          >
            <Text style={styles.manualCaptureText}>Capture now</Text>
          </Pressable>
        ) : null}

        {uri ? (
          <Pressable onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
            <Ionicons name="close-circle" size={24} color="#ffffff" />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tipsCard}>
        {tips.map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={14} color={ACCENT_DARK} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    alignItems: "center",
    gap: 14,
  },
  hint: {
    width: "100%",
    fontSize: 12,
    color: colors.gray[500],
    lineHeight: 17,
  },
  rejectionBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  rejectionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.error[700],
    fontWeight: "600",
  },
  ringWrap: {
    position: "relative",
    alignItems: "center",
    gap: 10,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2.5,
    borderColor: colors.gray[300],
    borderStyle: "dashed",
    overflow: "hidden",
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
  },
  ringFilled: {
    borderStyle: "solid",
    borderColor: ACCENT,
    backgroundColor: "#ffffff",
  },
  camera: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ringOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringGuide: {
    width: RING_SIZE - 18,
    height: RING_SIZE - 18,
    borderRadius: (RING_SIZE - 18) / 2,
    borderWidth: 2,
    borderColor: "rgba(57, 211, 83, 0.55)",
  },
  countdownBadge: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(34, 167, 69, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  countdownText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  permissionFallback: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  permissionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ACCENT_DARK,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permissionBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: 280,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray[400],
  },
  statusDotReady: {
    backgroundColor: ACCENT,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray[700],
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  manualCaptureBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.35)",
    backgroundColor: "#ffffff",
  },
  manualCaptureBtnPressed: {
    opacity: 0.85,
  },
  manualCaptureBtnDisabled: {
    opacity: 0.45,
  },
  manualCaptureText: {
    fontSize: 12,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    zIndex: 3,
  },
  tipsCard: {
    width: "100%",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.2)",
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: colors.gray[600],
    lineHeight: 17,
  },
});
