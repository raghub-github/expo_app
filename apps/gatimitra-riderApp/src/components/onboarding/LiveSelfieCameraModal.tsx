import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isExpoGo } from "@/src/lib/is-expo-go";
import {
  BlinkCaptureTracker,
  isSelfieFaceDetectorAvailable,
  probeIndicatesFacePresent,
  probeSelfieBlink,
  validateSelfieFace,
} from "@/src/lib/selfie-face-validation";

const ACCENT = "#39d353";
const PROBE_MS = 1400;
const ALLOW_EXPO_GO_MANUAL = isExpoGo();
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const OVAL_W = Math.min(SCREEN_W * 0.72, 300);
const OVAL_H = OVAL_W * 1.28;

type CameraFacing = "front" | "back";

type Props = {
  visible: boolean;
  disabled?: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void | Promise<void>;
  onRejected?: (message: string) => void;
};

async function persistCaptureBeforeUnmount(uri: string): Promise<string> {
  if (Platform.OS === "web") return uri;
  if (
    !uri.startsWith("file:") &&
    !uri.startsWith("content:") &&
    !uri.startsWith("ph:") &&
    !uri.startsWith("assets-library:")
  ) {
    return uri;
  }
  try {
    const FS = await import("expo-file-system/legacy");
    const dir = FS.cacheDirectory || FS.documentDirectory;
    if (!dir) return uri;
    const dest = `${dir}live-selfie-${Date.now()}.jpg`;
    await FS.copyAsync({ from: uri, to: dest });
    const info = await FS.getInfoAsync(dest);
    if (!info.exists) return uri;
    return dest;
  } catch {
    return uri;
  }
}

/**
 * Full-screen live selfie camera — oval guide, face-gated shutter, flip camera.
 * Replaces the old in-card circle capture UI for onboarding.
 */
export function LiveSelfieCameraModal({
  visible,
  disabled,
  onClose,
  onCaptured,
  onRejected,
}: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraFacing>("front");
  const [cameraReady, setCameraReady] = useState(false);
  const [facePresent, setFacePresent] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState<"align" | "blink">("align");
  const [capturing, setCapturing] = useState(false);
  const [detectorUnavailable, setDetectorUnavailable] = useState(false);
  const [statusText, setStatusText] = useState("Please align the face in the center");

  const capturingRef = useRef(false);
  const probingRef = useRef(false);
  const facePresentRef = useRef(false);
  const blinkTrackerRef = useRef(new BlinkCaptureTracker());

  const resetProbe = useCallback(() => {
    blinkTrackerRef.current.reset();
    setBlinkPhase("align");
    setFacePresent(false);
    facePresentRef.current = false;
    setStatusText("Please align the face in the center");
  }, []);

  useEffect(() => {
    if (!visible) {
      setCameraReady(false);
      setCapturing(false);
      capturingRef.current = false;
      setDetectorUnavailable(false);
      resetProbe();
      return;
    }
    if (!permission?.granted) {
      void requestPermission();
    }
    if (!isSelfieFaceDetectorAvailable()) {
      setDetectorUnavailable(true);
      if (ALLOW_EXPO_GO_MANUAL) {
        setStatusText("Dev mode — tap Capture to continue");
      }
    }
  }, [visible, permission?.granted, requestPermission, resetProbe]);

  const captureReady =
    ALLOW_EXPO_GO_MANUAL ||
    (facePresent && (detectorUnavailable || blinkPhase === "blink"));

  const captureFinal = useCallback(async () => {
    if (capturingRef.current || disabled || !cameraReady) return;
    if (!ALLOW_EXPO_GO_MANUAL && !facePresentRef.current) return;
    if (
      !ALLOW_EXPO_GO_MANUAL &&
      !detectorUnavailable &&
      blinkTrackerRef.current.getPhase() !== "blink"
    ) {
      return;
    }

    capturingRef.current = true;
    setCapturing(true);
    setStatusText("Capturing…");
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.6,
        skipProcessing: false,
        shutterSound: false,
      });
      if (!photo?.uri) {
        resetProbe();
        return;
      }

      if (!ALLOW_EXPO_GO_MANUAL) {
        const validation = await validateSelfieFace(photo.uri, {
          allowWithoutDetector: false,
        });
        if (!validation.ok) {
          onRejected?.(validation.message);
          resetProbe();
          return;
        }
      }

      // Copy off camera temp storage BEFORE closing CameraView (temp URI dies on unmount).
      const durableUri = await persistCaptureBeforeUnmount(photo.uri);
      await onCaptured(durableUri);
      onClose();
    } catch {
      resetProbe();
      onRejected?.("Could not capture selfie. Please try again.");
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }, [
    cameraReady,
    disabled,
    detectorUnavailable,
    onCaptured,
    onClose,
    onRejected,
    resetProbe,
  ]);

  useEffect(() => {
    if (!visible || disabled || !permission?.granted || !cameraReady) return;
    if (detectorUnavailable && !ALLOW_EXPO_GO_MANUAL) return;
    if (ALLOW_EXPO_GO_MANUAL && detectorUnavailable) return;

    const interval = setInterval(() => {
      void (async () => {
        if (probingRef.current || capturingRef.current) return;
        probingRef.current = true;
        try {
          const preview = await cameraRef.current?.takePictureAsync({
            quality: 0.25,
            skipProcessing: true,
            shutterSound: false,
          });
          if (!preview?.uri) return;

          const probe = await probeSelfieBlink(preview.uri);
          if (probe === "no_detector") {
            setDetectorUnavailable(true);
            resetProbe();
            if (ALLOW_EXPO_GO_MANUAL) {
              setStatusText("Dev mode — tap Capture to continue");
            }
            clearInterval(interval);
            return;
          }

          const hasFace = probeIndicatesFacePresent(probe);
          facePresentRef.current = hasFace;
          setFacePresent(hasFace);

          if (!hasFace) {
            blinkTrackerRef.current.reset();
            setBlinkPhase("align");
            setStatusText("Please align the face in the center");
            return;
          }

          const action = blinkTrackerRef.current.consume(probe);
          const phase = blinkTrackerRef.current.getPhase();
          setBlinkPhase(phase);
          setStatusText(
            phase === "blink"
              ? "✓ Face Detected, please wait"
              : "Hold still — get ready to blink"
          );

          if (action === "capture") {
            clearInterval(interval);
            await captureFinal();
          }
        } finally {
          probingRef.current = false;
        }
      })();
    }, PROBE_MS);

    return () => clearInterval(interval);
  }, [
    visible,
    disabled,
    permission?.granted,
    cameraReady,
    detectorUnavailable,
    captureFinal,
    resetProbe,
  ]);

  const ovalAligned = facePresent && !detectorUnavailable;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            ref={cameraRef}
            facing={facing}
            mode="picture"
            mirror={facing === "front"}
            animateShutter={false}
            style={StyleSheet.absoluteFill}
            onCameraReady={() => setCameraReady(true)}
          />
        ) : (
          <View style={styles.permissionWrap}>
            <Text style={styles.permissionText}>Camera access is required for selfie</Text>
            <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}>
              <Text style={styles.permissionBtnText}>Enable Camera</Text>
            </Pressable>
          </View>
        )}

        {/* Dim mask with oval cutout */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.maskTop} />
          <View style={styles.maskMidRow}>
            <View style={styles.maskSide} />
            <View
              style={[
                styles.oval,
                ovalAligned ? styles.ovalAligned : styles.ovalIdle,
              ]}
            />
            <View style={styles.maskSide} />
          </View>
          <View style={styles.maskBottom} />
        </View>

        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
          <Pressable
            onPress={onClose}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Close camera"
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.statusText} numberOfLines={2}>
            {statusText}
          </Text>
          <View style={styles.backBtn} />
        </View>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Pressable
            onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
            style={styles.flipBtn}
            accessibilityRole="button"
            accessibilityLabel="Flip camera"
          >
            <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
          </Pressable>

          {captureReady ? (
            <Pressable
              onPress={() => {
                if (capturing || disabled) return;
                void captureFinal();
              }}
              disabled={capturing || disabled || !cameraReady}
              style={[
                styles.shutterOuter,
                (capturing || !cameraReady) && styles.shutterDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Capture selfie"
            >
              {capturing ? (
                <ActivityIndicator color="#0f172a" />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
          ) : (
            <View style={styles.shutterPlaceholder} />
          )}

          <View style={styles.flipBtn} />
        </View>
      </View>
    </Modal>
  );
}

const MASK = "rgba(0,0,0,0.55)";
const sideW = (SCREEN_W - OVAL_W) / 2;
const topH = Math.max(SCREEN_H * 0.18, 120);
const bottomH = SCREEN_H - topH - OVAL_H;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  maskTop: {
    height: topH,
    backgroundColor: MASK,
  },
  maskMidRow: {
    flexDirection: "row",
    height: OVAL_H,
  },
  maskSide: {
    width: sideW,
    backgroundColor: MASK,
  },
  oval: {
    width: OVAL_W,
    height: OVAL_H,
    borderRadius: OVAL_W / 2,
    borderWidth: 3,
    backgroundColor: "transparent",
  },
  ovalIdle: {
    borderColor: "rgba(255,255,255,0.85)",
    borderStyle: "dashed",
  },
  ovalAligned: {
    borderColor: ACCENT,
    borderStyle: "solid",
    borderWidth: 4,
  },
  maskBottom: {
    flex: 1,
    minHeight: Math.max(bottomH, 160),
    backgroundColor: MASK,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    flex: 1,
    textAlign: "center",
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 20,
    backgroundColor: "rgba(0,0,0,0.82)",
  },
  flipBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  shutterDisabled: {
    opacity: 0.28,
  },
  shutterPlaceholder: {
    width: 76,
    height: 76,
  },
  permissionWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  permissionText: {
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
  },
  permissionBtn: {
    backgroundColor: ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
