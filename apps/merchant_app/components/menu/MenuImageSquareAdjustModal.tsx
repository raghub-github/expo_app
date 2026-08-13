/**
 * Square crop adjust — pan + pinch-zoom inside a 1:1 frame, then export JPEG.
 * Bakes EXIF (rotate 0) so preview pixels match the crop buffer.
 * Auto-adjust fills the square (cover). User can pinch/drag, then Use photo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  StatusBar,
  Platform,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant, FONT_LORA, FONT_LORA_BOLD, BUTTON_RADIUS } from "@/constants/theme";

export type AdjustedImageFile = { uri: string; type: string; name: string };

type Props = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: (file: AdjustedImageFile) => void;
};

const MIN_SIDE = 400;
const MAX_SIDE = 2000;
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const LETTERBOX_BG = "#F3F4F6";

type LetterboxJob = {
  html: string;
};

function cropFullyInside(
  originX: number,
  originY: number,
  side: number,
  w: number,
  h: number
): boolean {
  return originX >= 0 && originY >= 0 && originX + side <= w + 0.5 && originY + side <= h + 0.5;
}

async function bakeOrientation(uri: string): Promise<{ uri: string; w: number; h: number }> {
  const baked = await ImageManipulator.manipulateAsync(uri, [{ rotate: 0 }], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const w = baked.width;
  const h = baked.height;
  if (w > 0 && h > 0) return { uri: baked.uri, w, h };
  const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(baked.uri, (width, height) => resolve({ width, height }), reject);
  });
  return { uri: baked.uri, w: dims.width, h: dims.height };
}

function buildLetterboxHtml(opts: {
  dataUrl: string;
  originX: number;
  originY: number;
  cropSide: number;
  outDim: number;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
<canvas id="c"></canvas>
<script>
(function () {
  var OUT = ${opts.outDim};
  var originX = ${opts.originX};
  var originY = ${opts.originY};
  var cropSide = ${opts.cropSide};
  var src = ${JSON.stringify(opts.dataUrl)};
  var c = document.getElementById("c");
  c.width = OUT;
  c.height = OUT;
  var ctx = c.getContext("2d");
  var img = new Image();
  img.onload = function () {
    ctx.fillStyle = ${JSON.stringify(LETTERBOX_BG)};
    ctx.fillRect(0, 0, OUT, OUT);
    var scale = OUT / cropSide;
    ctx.drawImage(img, -originX * scale, -originY * scale, img.naturalWidth * scale, img.naturalHeight * scale);
    var data = c.toDataURL("image/jpeg", 0.92);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  };
  img.onerror = function () {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage("ERROR");
  };
  img.src = src;
})();
</script></body></html>`;
}

export function MenuImageSquareAdjustModal({ visible, uri, onCancel, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const frame = Math.min(winW - 48, 340);
  const [workUri, setWorkUri] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [letterboxJob, setLetterboxJob] = useState<LetterboxJob | null>(null);
  const letterboxWait = useRef<{
    resolve: (uri: string) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const letterboxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (letterboxTimerRef.current) {
        clearTimeout(letterboxTimerRef.current);
        letterboxTimerRef.current = null;
      }
    };
  }, []);

  const frameSV = useSharedValue(frame);
  const natW = useSharedValue(0);
  const natH = useSharedValue(0);
  const baseScale = useSharedValue(1);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const exportScale = useSharedValue(1);
  const exportX = useSharedValue(0);
  const exportY = useSharedValue(0);

  const clampPan = (x: number, y: number, s: number) => {
    "worklet";
    const dispW = natW.value * baseScale.value * s;
    const dispH = natH.value * baseScale.value * s;
    const maxX = Math.max(0, (dispW - frameSV.value) / 2);
    const maxY = Math.max(0, (dispH - frameSV.value) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const applyAutoFit = useCallback(() => {
    if (!natural?.w || !natural?.h) return;
    const cover = Math.max(frame / natural.w, frame / natural.h);
    frameSV.value = frame;
    natW.value = natural.w;
    natH.value = natural.h;
    baseScale.value = cover;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    exportScale.value = 1;
    exportX.value = 0;
    exportY.value = 0;
  }, [
    natural,
    frame,
    frameSV,
    natW,
    natH,
    baseScale,
    scale,
    translateX,
    translateY,
    exportScale,
    exportX,
    exportY,
  ]);

  useEffect(() => {
    if (!visible) {
      setWorkUri(null);
      setNatural(null);
      setBusy(false);
      setPreparing(false);
      setLetterboxJob(null);
      letterboxWait.current?.reject(new Error("cancelled"));
      letterboxWait.current = null;
      if (letterboxTimerRef.current) {
        clearTimeout(letterboxTimerRef.current);
        letterboxTimerRef.current = null;
      }
      return;
    }
    if (Platform.OS === "android") {
      StatusBar.setBarStyle("dark-content");
      StatusBar.setBackgroundColor("#F1F5F9");
    }
  }, [visible]);

  useEffect(() => {
    if (!uri || !visible) return;
    let cancelled = false;
    setPreparing(true);
    setWorkUri(null);
    setNatural(null);
    void (async () => {
      try {
        const baked = await bakeOrientation(uri);
        if (cancelled) return;
        setWorkUri(baked.uri);
        setNatural({ w: baked.w, h: baked.h });
      } catch {
        if (!cancelled) {
          setWorkUri(uri);
          Image.getSize(
            uri,
            (w, h) => {
              if (!cancelled && w > 0 && h > 0) setNatural({ w, h });
            },
            () => {}
          );
        }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, visible]);

  useEffect(() => {
    applyAutoFit();
  }, [applyAutoFit]);

  const syncExport = useCallback(() => {
    exportScale.value = scale.value;
    exportX.value = translateX.value;
    exportY.value = translateY.value;
  }, [exportScale, exportX, exportY, scale, translateX, translateY]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = clampPan(startX.value + e.translationX, startY.value + e.translationY, scale.value);
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      runOnJS(syncExport)();
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, startScale.value * e.scale));
      scale.value = nextScale;
      const next = clampPan(startX.value, startY.value, nextScale);
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      runOnJS(syncExport)();
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => {
    const dispW = natW.value * baseScale.value * scale.value;
    const dispH = natH.value * baseScale.value * scale.value;
    return {
      position: "absolute" as const,
      width: dispW,
      height: dispH,
      left: (frameSV.value - dispW) / 2 + translateX.value,
      top: (frameSV.value - dispH) / 2 + translateY.value,
    };
  });

  const runLetterbox = useCallback((html: string) => {
    return new Promise<string>((resolve, reject) => {
      letterboxWait.current?.reject(new Error("replaced"));
      if (letterboxTimerRef.current) {
        clearTimeout(letterboxTimerRef.current);
        letterboxTimerRef.current = null;
      }
      letterboxWait.current = { resolve, reject };
      setLetterboxJob({ html });
      letterboxTimerRef.current = setTimeout(() => {
        if (letterboxWait.current?.reject === reject) {
          letterboxWait.current = null;
          if (mountedRef.current) setLetterboxJob(null);
          reject(new Error("letterbox timeout"));
        }
      }, 20000);
    });
  }, []);

  const handleLetterboxMessage = useCallback(
    async (raw: string) => {
      const waiter = letterboxWait.current;
      letterboxWait.current = null;
      if (letterboxTimerRef.current) {
        clearTimeout(letterboxTimerRef.current);
        letterboxTimerRef.current = null;
      }
      setLetterboxJob(null);
      if (!waiter) return;
      if (!raw || raw === "ERROR" || !raw.startsWith("data:image")) {
        waiter.reject(new Error("letterbox failed"));
        return;
      }
      try {
        const b64 = raw.replace(/^data:image\/\w+;base64,/, "");
        const outPath = `${FileSystem.cacheDirectory ?? ""}menu-sq-${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(outPath, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        waiter.resolve(outPath);
      } catch (err) {
        waiter.reject(err instanceof Error ? err : new Error("letterbox write failed"));
      }
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    const src = workUri;
    if (!src || !natural || busy) return;
    setBusy(true);
    try {
      const userScale = Math.max(MIN_ZOOM, exportScale.value || 1);
      const panX = exportX.value;
      const panY = exportY.value;
      const cover = Math.max(frame / natural.w, frame / natural.h);
      const totalScale = cover * userScale;
      const cropSide = frame / totalScale;
      const originX = natural.w / 2 - cropSide / 2 - panX / totalScale;
      const originY = natural.h / 2 - cropSide / 2 - panY / totalScale;
      const outDim = Math.min(Math.max(Math.round(cropSide), MIN_SIDE), MAX_SIDE);

      let outUri = src;
      if (cropFullyInside(originX, originY, cropSide, natural.w, natural.h)) {
        const side = Math.max(1, Math.floor(cropSide));
        const ox = Math.max(0, Math.min(Math.floor(natural.w - side), Math.round(originX)));
        const oy = Math.max(0, Math.min(Math.floor(natural.h - side), Math.round(originY)));
        let compress = 0.92;
        for (let i = 0; i < 5; i++) {
          const result = await ImageManipulator.manipulateAsync(
            src,
            [
              { crop: { originX: ox, originY: oy, width: side, height: side } },
              { resize: { width: outDim, height: outDim } },
            ],
            { compress, format: ImageManipulator.SaveFormat.JPEG }
          );
          outUri = result.uri;
          const blob = await (await fetch(result.uri)).blob();
          if (blob.size > 0 && blob.size <= MAX_BYTES) break;
          compress -= 0.12;
        }
      } else {
        const maxSide = Math.max(natural.w, natural.h);
        const shrink = maxSide > 1600 ? 1600 / maxSide : 1;
        let work = src;
        let w = natural.w;
        if (shrink < 1) {
          const resized = await ImageManipulator.manipulateAsync(
            src,
            [{ resize: { width: Math.round(natural.w * shrink), height: Math.round(natural.h * shrink) } }],
            { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
          );
          work = resized.uri;
          w = resized.width;
        }
        const ratio = w / natural.w;
        const b64 = await FileSystem.readAsStringAsync(work, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const html = buildLetterboxHtml({
          dataUrl: `data:image/jpeg;base64,${b64}`,
          originX: originX * ratio,
          originY: originY * ratio,
          cropSide: cropSide * ratio,
          outDim,
        });
        outUri = await runLetterbox(html);
      }

      onConfirm({ uri: outUri, type: "image/jpeg", name: "menu-item.jpg" });
    } catch {
      try {
        const { normalizeMenuItemImageUri } = await import("@/lib/normalizeMenuItemImage");
        const res = await normalizeMenuItemImageUri(src);
        if (res.ok) onConfirm(res.file);
        else onCancel();
      } catch {
        onCancel();
      }
    } finally {
      setBusy(false);
    }
  }, [workUri, natural, busy, frame, exportScale, exportX, exportY, onConfirm, onCancel, runLetterbox]);

  if (!uri) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ExpoStatusBar style="dark" />
        {Platform.OS === "android" ? (
          <StatusBar backgroundColor="#F1F5F9" barStyle="dark-content" />
        ) : null}
        <View
          style={[
            styles.screen,
            { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom + 12 },
          ]}
        >
          <View style={styles.header}>
            <Pressable onPress={onCancel} hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Adjust photo</Text>
            <Pressable onPress={applyAutoFit} hitSlop={12} style={styles.headerBtn}>
              <Text style={styles.resetText}>Auto</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>Pinch to zoom · Drag to position · Auto fills the square</Text>

          <View style={styles.stage}>
            <View style={[styles.frame, { width: frame, height: frame }]} collapsable={false}>
              {preparing || !workUri || !natural ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <GestureDetector gesture={composed}>
                  <Animated.View collapsable={false} style={imageStyle}>
                    <Image
                      source={{ uri: workUri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="stretch"
                    />
                  </Animated.View>
                </GestureDetector>
              )}
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.secondaryBtn, busy && { opacity: 0.7 }]}
              onPress={applyAutoFit}
              disabled={busy || !natural}
            >
              <Text style={styles.secondaryBtnText}>Auto-adjust</Text>
            </Pressable>
            <Pressable
              style={[styles.useBtn, busy && { opacity: 0.7 }]}
              onPress={() => void handleConfirm()}
              disabled={busy || preparing || !natural}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.useBtnText}>Use photo</Text>
              )}
            </Pressable>
          </View>
        </View>
        {letterboxJob ? (
          <WebView
            source={{ html: letterboxJob.html }}
            onMessage={(e) => {
              void handleLetterboxMessage(e.nativeEvent.data);
            }}
            originWhitelist={["*"]}
            javaScriptEnabled
            style={styles.hiddenWebView}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  headerBtn: {
    minWidth: 64,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  resetText: {
    fontSize: 14,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.primary,
  },
  hint: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: FONT_LORA,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: LETTERBOX_BG,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    marginHorizontal: 20,
    marginTop: 16,
    gap: 10,
  },
  secondaryBtn: {
    height: 44,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: GatiMitraMerchant.textPrimary,
    fontSize: 14,
    fontFamily: FONT_LORA_BOLD,
  },
  useBtn: {
    height: 48,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  useBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: FONT_LORA_BOLD,
  },
  hiddenWebView: {
    position: "absolute",
    width: 8,
    height: 8,
    opacity: 0.01,
    left: 0,
    top: 0,
  },
});
