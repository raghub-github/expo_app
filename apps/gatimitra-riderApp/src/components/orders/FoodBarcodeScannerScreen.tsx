import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { CameraView } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { LORA_BOLD, LORA_SEMIBOLD } from "@/src/theme/headerFonts";
import { readCameraPermission } from "@/src/lib/cameraPermission";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

type Props = {
  visible: boolean;
  /** Set when permission was just granted in the sheet — avoids stale hook cache. */
  cameraGrantedHint?: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onScanned: (value: string) => void;
};

const FRAME = 268;

type PermissionPhase = "loading" | "granted" | "denied";

export function FoodBarcodeScannerScreen({
  visible,
  cameraGrantedHint = false,
  loading = false,
  error,
  onClose,
  onScanned,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scannedRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionPhase, setPermissionPhase] = useState<PermissionPhase>("loading");

  useEffect(() => {
    if (!visible) {
      scannedRef.current = false;
      setCameraReady(false);
      setPermissionPhase("loading");
      return;
    }

    let cancelled = false;

    void (async () => {
      if (cameraGrantedHint) {
        setPermissionPhase("granted");
      } else {
        setPermissionPhase("loading");
      }

      const applySnapshot = async (retryAfterHint = false) => {
        const snapshot = await readCameraPermission();
        if (cancelled) return;
        if (snapshot.granted) {
          setPermissionPhase("granted");
          return;
        }
        if (cameraGrantedHint && !retryAfterHint) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (!cancelled) await applySnapshot(true);
          return;
        }
        setPermissionPhase("denied");
      };

      await applySnapshot();
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, cameraGrantedHint]);

  const handleBarcode = useCallback(
    (result: { data?: string }) => {
      if (loading || scannedRef.current) return;
      const value = String(result?.data ?? "").trim();
      if (!value) return;
      scannedRef.current = true;
      onScanned(value);
    },
    [loading, onScanned]
  );

  const topPad = Math.max(insets.top, Platform.OS === "android" ? 12 : 8);
  const bottomPad = resolveRiderBottomInset(insets.bottom);
  const hasCameraAccess = permissionPhase === "granted";
  const showPermissionLoading = permissionPhase === "loading" && !cameraGrantedHint;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {showPermissionLoading ? (
          <View style={styles.noAccessRoot}>
            <ActivityIndicator size="large" color={colors.primary[400]} />
            <Text style={styles.loadingPermissionText}>
              {t("orders.activeFood.openingCamera", "Opening camera…")}
            </Text>
          </View>
        ) : hasCameraAccess ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8", "pdf417"],
            }}
            onCameraReady={() => setCameraReady(true)}
            onBarcodeScanned={cameraReady && !loading && visible ? handleBarcode : undefined}
          />
        ) : (
          <View style={styles.noAccessRoot}>
            <View style={styles.noAccessIconWrap}>
              <Ionicons name="camera-outline" size={36} color={colors.primary[400]} />
            </View>
            <Text style={styles.noAccessTitle}>
              {t("orders.activeFood.cameraRequiredTitle", "Camera access required")}
            </Text>
            <Text style={styles.noAccessDesc}>
              {t(
                "orders.activeFood.cameraRequiredDesc",
                "Go back and tap Scan Barcode to allow camera access for pickup verification."
              )}
            </Text>
            <Pressable style={styles.noAccessBtn} onPress={onClose}>
              <Text style={styles.noAccessBtnText}>
                {t("orders.activeFood.goBack", "Go back")}
              </Text>
            </Pressable>
          </View>
        )}

        {hasCameraAccess ? (
          <View style={styles.dimOverlay} pointerEvents="none">
            <View style={[styles.dimBand, { height: "22%" }]} />
            <View style={styles.dimMiddleRow}>
              <View style={styles.dimSide} />
              <View style={styles.frameCutout}>
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
                {loading ? (
                  <View style={styles.frameSuccess}>
                    <Ionicons name="checkmark-circle" size={48} color={colors.primary[400]} />
                  </View>
                ) : null}
              </View>
              <View style={styles.dimSide} />
            </View>
            <View style={[styles.dimBand, { flex: 1 }]} />
          </View>
        ) : null}

        <View style={[styles.header, { paddingTop: topPad }]}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            disabled={loading}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {t("orders.activeFood.scanBarcode", "Scan Barcode")}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {hasCameraAccess ? (
          <View style={[styles.footer, { paddingBottom: bottomPad }]}>
            <Text style={styles.hint}>
              {t(
                "orders.activeFood.scanBarcodeHint",
                "Align the bill barcode or merchant QR inside the frame"
              )}
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary[300]} />
                <Text style={styles.loadingText}>
                  {t("orders.activeFood.verifyingPickup", "Verifying pickup…")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const CORNER = 28;
const STROKE = 4;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
    fontSize: 18,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerSpacer: {
    width: 44,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  dimBand: {
    backgroundColor: "rgba(15, 23, 42, 0.62)",
  },
  dimMiddleRow: {
    flexDirection: "row",
    height: FRAME,
  },
  dimSide: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
  },
  frameCutout: {
    width: FRAME,
    height: FRAME,
    position: "relative",
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: CORNER,
    height: CORNER,
    borderTopWidth: STROKE,
    borderLeftWidth: STROKE,
    borderColor: colors.primary[400],
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: CORNER,
    height: CORNER,
    borderTopWidth: STROKE,
    borderRightWidth: STROKE,
    borderColor: colors.primary[400],
    borderTopRightRadius: 12,
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: CORNER,
    height: CORNER,
    borderBottomWidth: STROKE,
    borderLeftWidth: STROKE,
    borderColor: colors.primary[400],
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: CORNER,
    height: CORNER,
    borderBottomWidth: STROKE,
    borderRightWidth: STROKE,
    borderColor: colors.primary[400],
    borderBottomRightRadius: 12,
  },
  frameSuccess: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    borderRadius: 12,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    zIndex: 10,
    gap: 12,
  },
  hint: {
    fontFamily: LORA_SEMIBOLD,
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    flex: 1,
    color: "#B91C1C",
    fontSize: 14,
    lineHeight: 19,
  },
  noAccessRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  loadingPermissionText: {
    fontFamily: LORA_SEMIBOLD,
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    marginTop: 8,
  },
  noAccessIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  noAccessTitle: {
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
    fontSize: 20,
    textAlign: "center",
  },
  noAccessDesc: {
    fontFamily: LORA_SEMIBOLD,
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 8,
  },
  noAccessBtn: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary[400],
  },
  noAccessBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary[300],
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
});
