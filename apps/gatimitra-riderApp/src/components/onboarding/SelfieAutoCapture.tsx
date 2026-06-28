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
import {
  BlinkCaptureTracker,
  isSelfieFaceDetectorAvailable,
  probeIndicatesFacePresent,
  probeSelfieBlink,
  validateSelfieFace,
} from "@/src/lib/selfie-face-validation";
import { colors } from "@/src/theme";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const RING_SIZE = 200;
const BLINK_PROBE_INTERVAL_MS = 800;
/** Metro / Expo Go dev sessions only — production release builds keep blink-only capture. */
const ALLOW_DEV_MANUAL_CAPTURE = __DEV__;

type CaptureStatus =
  | "permission"
  | "starting"
  | "searching"
  | "waiting_blink"
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
  const [facePresent, setFacePresent] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState<"align" | "blink">("align");
  const [rejection, setRejection] = useState<string | null>(null);
  const [detectorUnavailable, setDetectorUnavailable] = useState(false);
  const capturingRef = useRef(false);
  const probingRef = useRef(false);
  const facePresentRef = useRef(false);
  const blinkTrackerRef = useRef(new BlinkCaptureTracker());

  const captureFinal = useCallback(async (devManual = false) => {
    if (capturingRef.current || disabled || uri) return;
    const devBypass = devManual && ALLOW_DEV_MANUAL_CAPTURE;
    if (!devBypass && !facePresentRef.current) return;
    capturingRef.current = true;
    setStatus("capturing");
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
        shutterSound: false,
      });
      if (photo?.uri) {
        if (devBypass) {
          setRejection(null);
          await onCaptured(photo.uri);
          setStatus("done");
          return;
        }

        const validation = await validateSelfieFace(photo.uri);
        if (!validation.ok) {
          setRejection(validation.message);
          onRejected?.(validation.message);
          setStatus("searching");
          blinkTrackerRef.current.reset();
          setBlinkPhase("align");
          setFacePresent(false);
          facePresentRef.current = false;
          return;
        }
        setRejection(null);
        await onCaptured(photo.uri);
        setStatus("done");
      } else {
        setStatus("searching");
        blinkTrackerRef.current.reset();
        setBlinkPhase("align");
        setFacePresent(false);
        facePresentRef.current = false;
      }
    } catch {
      setStatus("searching");
      blinkTrackerRef.current.reset();
      setBlinkPhase("align");
      setFacePresent(false);
      facePresentRef.current = false;
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

    if (!isSelfieFaceDetectorAvailable()) {
      setDetectorUnavailable(true);
    }

    setStatus(cameraReady ? "searching" : "starting");
  }, [active, uri, disabled, permission, requestPermission, cameraReady]);

  useEffect(() => {
    if (!active || uri || disabled || !permission?.granted || !cameraReady) return;
    if (detectorUnavailable) return;

    const interval = setInterval(() => {
      void (async () => {
        if (probingRef.current || capturingRef.current || disabled || uri) return;
        probingRef.current = true;
        try {
          const preview = await cameraRef.current?.takePictureAsync({
            quality: 0.35,
            skipProcessing: true,
            shutterSound: false,
          });
          if (!preview?.uri) return;

          const probe = await probeSelfieBlink(preview.uri);
          if (probe === "no_detector") {
            setDetectorUnavailable(true);
            setFacePresent(false);
            facePresentRef.current = false;
            blinkTrackerRef.current.reset();
            setBlinkPhase("align");
            setStatus("searching");
            clearInterval(interval);
            return;
          }

          const hasFace = probeIndicatesFacePresent(probe);
          setFacePresent(hasFace);
          facePresentRef.current = hasFace;

          if (!hasFace) {
            blinkTrackerRef.current.reset();
            setBlinkPhase("align");
            setStatus("searching");
            return;
          }

          const action = blinkTrackerRef.current.consume(probe);
          const phase = blinkTrackerRef.current.getPhase();
          setBlinkPhase(phase);
          setStatus(phase === "blink" ? "waiting_blink" : "searching");

          if (action === "capture") {
            clearInterval(interval);
            await captureFinal();
          }
        } finally {
          probingRef.current = false;
        }
      })();
    }, BLINK_PROBE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [
    active,
    uri,
    disabled,
    permission?.granted,
    cameraReady,
    captureFinal,
    detectorUnavailable,
  ]);

  useEffect(() => {
    if (uri) return;
    blinkTrackerRef.current.reset();
    setBlinkPhase("align");
    setFacePresent(false);
    facePresentRef.current = false;
    setDetectorUnavailable(false);
    setRejection(null);
    if (!active) {
      setCameraReady(false);
      setStatus("starting");
    }
  }, [uri, active]);

  const statusLabel =
    status === "permission"
      ? "Allow camera access to continue"
      : status === "starting"
        ? "Starting camera…"
        : detectorUnavailable
          ? ALLOW_DEV_MANUAL_CAPTURE
            ? "Dev mode — tap Capture below to test onboarding"
            : "Face detection needs rider dev build (not Expo Go)"
          : status === "waiting_blink"
            ? "Face detected — blink your eyes to capture"
            : status === "searching"
              ? facePresent
                ? "Hold still — get ready to blink"
                : "Position your face inside the red circle"
              : status === "capturing"
                ? "Capturing…"
                : "Selfie captured";

  const ringBorderStyle = uri
    ? styles.ringCaptured
    : detectorUnavailable || !facePresent
      ? styles.ringNoFace
      : blinkPhase === "blink"
        ? styles.ringBlinkReady
        : styles.ringFaceDetected;

  const ringGuideStyle = uri
    ? styles.ringGuideCaptured
    : detectorUnavailable || !facePresent
      ? styles.ringGuideNoFace
      : blinkPhase === "blink"
        ? styles.ringGuideBlink
        : styles.ringGuideFace;

  return (
    <View style={styles.section}>
      <Text style={styles.hint}>{hint}</Text>

      {rejection ? (
        <View style={styles.rejectionBanner}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error[600]} />
          <Text style={styles.rejectionText}>{rejection}</Text>
        </View>
      ) : null}

      {detectorUnavailable && ALLOW_DEV_MANUAL_CAPTURE ? (
        <View style={styles.detectorBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning[700]} />
          <Text style={styles.detectorBannerText}>
            Expo Go cannot run live face/blink detection. Use the Capture button below to test the
            rest of onboarding. Production builds require face + blink before continuing.
          </Text>
        </View>
      ) : detectorUnavailable ? (
        <View style={styles.detectorBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning[700]} />
          <Text style={styles.detectorBannerText}>
            Live face + blink capture works in the installed rider app build. Expo Go cannot scan
            faces — run{" "}
            <Text style={styles.detectorBannerCode}>npx expo run:android</Text> and open that app.
          </Text>
        </View>
      ) : null}

      <View style={styles.ringWrap}>
        <View style={[styles.ring, ringBorderStyle]}>
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
                <View style={[styles.ringGuide, ringGuideStyle]} />
                {status === "waiting_blink" && facePresent ? (
                  <View style={styles.blinkBadge}>
                    <Ionicons name="eye-outline" size={22} color="#ffffff" />
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
          <View
            style={[
              styles.statusPill,
              !facePresent && !detectorUnavailable ? styles.statusPillAlert : null,
            ]}
            pointerEvents="none"
          >
            {status === "capturing" || status === "starting" ? (
              <ActivityIndicator size="small" color={ACCENT_DARK} />
            ) : (
              <View
                style={[
                  styles.statusDot,
                  facePresent ? styles.statusDotReady : styles.statusDotAlert,
                ]}
              />
            )}
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        ) : null}

        {ALLOW_DEV_MANUAL_CAPTURE && !uri && permission?.granted && status !== "capturing" ? (
          <Pressable
            onPress={() => void captureFinal(true)}
            disabled={disabled || !cameraReady}
            style={({ pressed }) => [
              styles.devCaptureBtn,
              pressed && styles.devCaptureBtnPressed,
              (disabled || !cameraReady) && styles.devCaptureBtnDisabled,
            ]}
          >
            <Ionicons name="camera-outline" size={18} color="#ffffff" />
            <Text style={styles.devCaptureBtnText}>Capture</Text>
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
  detectorBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  detectorBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.warning[800],
  },
  detectorBannerCode: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontWeight: "700",
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
    borderWidth: 3,
    borderStyle: "dashed",
    overflow: "hidden",
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
  },
  ringNoFace: {
    borderColor: colors.error[500],
    borderStyle: "solid",
    backgroundColor: "#fff5f5",
  },
  ringFaceDetected: {
    borderColor: ACCENT_DARK,
    borderStyle: "solid",
    backgroundColor: "#f0fdf4",
  },
  ringBlinkReady: {
    borderColor: ACCENT,
    borderStyle: "solid",
    backgroundColor: "#ecfdf3",
  },
  ringCaptured: {
    borderColor: ACCENT,
    borderStyle: "solid",
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
  },
  ringGuideNoFace: {
    borderColor: "rgba(239, 68, 68, 0.65)",
  },
  ringGuideFace: {
    borderColor: "rgba(34, 167, 69, 0.55)",
  },
  ringGuideBlink: {
    borderColor: ACCENT,
    borderWidth: 2.5,
  },
  ringGuideCaptured: {
    borderColor: "rgba(57, 211, 83, 0.55)",
  },
  blinkBadge: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
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
    maxWidth: 300,
  },
  statusPillAlert: {
    backgroundColor: colors.error[50],
    borderColor: colors.error[200],
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
  statusDotAlert: {
    backgroundColor: colors.error[500],
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray[700],
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  devCaptureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: ACCENT_DARK,
    minWidth: 160,
  },
  devCaptureBtnPressed: {
    opacity: 0.88,
  },
  devCaptureBtnDisabled: {
    opacity: 0.45,
  },
  devCaptureBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
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
