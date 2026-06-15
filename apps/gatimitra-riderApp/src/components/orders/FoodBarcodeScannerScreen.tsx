import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onScanned: (value: string) => void;
};

export function FoodBarcodeScannerScreen({
  visible,
  loading = false,
  error,
  onClose,
  onScanned,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);

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

  React.useEffect(() => {
    if (!visible) {
      scannedRef.current = false;
      setCameraReady(false);
    }
  }, [visible]);

  const topPad = Math.max(insets.top, Platform.OS === "android" ? 12 : 8);
  const bottomPad = Math.max(insets.bottom, 16);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: topPad }]}>
          <Pressable onPress={onClose} hitSlop={12} disabled={loading}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {t("orders.activeFood.scanBarcode", "Scan Barcode")}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.cameraWrap}>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>
                {t(
                  "orders.activeFood.cameraPermission",
                  "Camera permission is required to scan barcodes."
                )}
              </Text>
              <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}>
                <Text style={styles.permissionBtnText}>
                  {t("orders.activeFood.allowCamera", "Allow camera")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8", "pdf417"],
              }}
              onCameraReady={() => setCameraReady(true)}
              onBarcodeScanned={cameraReady && !loading ? handleBarcode : undefined}
            />
          )}

          <View style={styles.frameOverlay} pointerEvents="none">
            <View style={styles.scanFrame} />
            <Text style={styles.hint}>
              {t(
                "orders.activeFood.scanBarcodeHint",
                "Align the bill barcode or merchant QR inside the frame"
              )}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>
                {t("orders.activeFood.verifyingPickup", "Verifying pickup…")}
              </Text>
            </View>
          ) : null}
        </View>

        {error ? (
          <View style={[styles.errorBox, { marginBottom: bottomPad }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  cameraWrap: {
    flex: 1,
    position: "relative",
  },
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  permissionText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 260,
    height: 260,
    borderWidth: 3,
    borderColor: colors.success[400],
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  hint: {
    marginTop: 24,
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center",
  },
});
