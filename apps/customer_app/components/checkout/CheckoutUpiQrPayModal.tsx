/**
 * In-app Scan QR Code for food checkout.
 * Shows Razorpay's official `image_url` from POST /v1/payments/qr_codes.
 * Payment is confirmed only via server webhook / pending-order poll — never
 * by displaying or scanning the QR alone.
 *
 * The gateway PNG is a tall branded poster. We crop a square window onto the
 * UPI matrix and render it large (near full screen width) so scanners can
 * read it easily — without stretching the module grid.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StoreFonts } from "@/constants/storeTypography";
import { GatiMitraColors } from "@/constants/gatimitra";

/**
 * Crop of the payable matrix inside Razorpay's standard upi_qr poster.
 * Width is a fraction of image width; height is a fraction of image height
 * (taller than square) so the bottom SCAN label / quiet zone is not clipped.
 */
const QR_MATRIX_CROP = {
  left: 0.145,
  top: 0.328,
  width: 0.71,
  /** Tall enough to fully show "SCAN & PAY WITH ANY UPI APP" under the matrix. */
  height: 0.40,
} as const;

type Props = {
  visible: boolean;
  imageUrl: string | null;
  amountPaise: number | null;
  expiresAt?: number | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onRetry?: () => void;
  onPollStatus?: () => Promise<{ finalized: boolean; orderId?: string | null; failed?: boolean }>;
  onPaid?: (orderId: string) => void;
  onFailed?: () => void;
  onExpired?: () => void;
};

type NaturalSize = { width: number; height: number };

function formatInrFromPaise(paise: number | null): string {
  if (paise == null || !Number.isFinite(paise) || paise <= 0) return "—";
  return `₹${(paise / 100).toFixed(2)}`;
}

/** Large frame — prefer width so the QR fills the phone. */
function resolveQrDisplayWidth(windowWidth: number, windowHeight: number): number {
  const byWidth = windowWidth - 28;
  const byHeight = windowHeight * 0.48;
  return Math.round(Math.min(Math.max(byWidth, 280), byHeight, 400));
}

function matrixCropLayout(displayW: number, natural: NaturalSize) {
  const { width: natW, height: natH } = natural;
  if (natW <= 0 || natH <= 0) return null;

  const cropW = Math.min(natW * QR_MATRIX_CROP.width, natW);
  const cropH = Math.min(natH * QR_MATRIX_CROP.height, natH * 0.46);
  const leftPx = Math.max(0, Math.min(natW - cropW, natW * QR_MATRIX_CROP.left));
  const maxTop = Math.max(0, natH - cropH - natH * 0.18);
  const topPx = Math.max(0, Math.min(maxTop, natH * QR_MATRIX_CROP.top));

  // Scale so the crop width fills the viewport width; taller cropH → full SCAN line.
  const scale = displayW / cropW;
  return {
    width: natW * scale,
    height: natH * scale,
    left: -leftPx * scale,
    top: -topPx * scale,
    viewportH: Math.round(cropH * scale),
  };
}

export function CheckoutUpiQrPayModal({
  visible,
  imageUrl,
  amountPaise,
  expiresAt = null,
  loading = false,
  error = null,
  onClose,
  onRetry,
  onPollStatus,
  onPaid,
  onFailed,
  onExpired,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const qrWidth = useMemo(
    () => resolveQrDisplayWidth(windowWidth, windowHeight),
    [windowWidth, windowHeight]
  );
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const cropLayout = useMemo(
    () => (natural ? matrixCropLayout(qrWidth, natural) : null),
    [natural, qrWidth]
  );
  const qrHeight = cropLayout?.viewportH ?? Math.round(qrWidth * 1.18);

  const onPollRef = useRef(onPollStatus);
  onPollRef.current = onPollStatus;
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!visible) {
      setExpired(false);
      setNatural(null);
      return;
    }
    setNatural(null);
    if (!imageUrl) return;
    let cancelled = false;
    Image.getSize(
      imageUrl,
      (w, h) => {
        if (cancelled || w <= 0 || h <= 0) return;
        setNatural({ width: w, height: h });
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [visible, imageUrl]);

  useEffect(() => {
    if (!visible) {
      setExpired(false);
      return;
    }
    if (expiresAt == null || !Number.isFinite(expiresAt) || expiresAt <= 0) return;
    const tick = () => {
      if (Math.floor(Date.now() / 1000) >= expiresAt) {
        setExpired(true);
        onExpiredRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [visible, expiresAt]);

  useEffect(() => {
    if (!visible || !imageUrl || expired || error || !onPollRef.current) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await onPollRef.current?.();
        if (cancelled || !s) return;
        if (s.finalized && s.orderId) {
          onPaidRef.current?.(s.orderId);
          return;
        }
        if (s.failed) {
          onFailedRef.current?.();
        }
      } catch {
        /* keep polling */
      }
    };
    void tick();
    const id = setInterval(() => {
      void tick();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [visible, imageUrl, expired, error]);

  const showExpired = expired && !loading && !error;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close Scan QR Code"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
          <Text style={styles.title}>Scan QR Code</Text>
          <View style={styles.closeBtn} />
        </View>

        <Text style={styles.amount}>{formatInrFromPaise(amountPaise)}</Text>
        <Text style={styles.hint}>Open any UPI app and scan this QR to pay</Text>

        <View style={styles.qrStage}>
          <View style={[styles.qrViewport, { width: qrWidth, height: qrHeight }]}>
            {loading ? (
              <ActivityIndicator size="large" color={GatiMitraColors.splashMint} />
            ) : error ? (
              <View style={styles.errBox}>
                <Text style={styles.errText}>{error}</Text>
                {onRetry ? (
                  <Pressable onPress={onRetry} style={styles.retryBtn}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : showExpired ? (
              <View style={styles.errBox}>
                <Text style={styles.errText}>
                  This QR Code has expired. Generate a new one to continue.
                </Text>
                {onRetry ? (
                  <Pressable onPress={onRetry} style={styles.retryBtn}>
                    <Text style={styles.retryText}>Generate new QR</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : imageUrl ? (
              cropLayout ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={[
                    styles.cropImage,
                    {
                      width: cropLayout.width,
                      height: cropLayout.height,
                      left: cropLayout.left,
                      top: cropLayout.top,
                    },
                  ]}
                  resizeMode="stretch"
                  accessibilityLabel="Razorpay UPI QR Code"
                />
              ) : (
                <ActivityIndicator size="large" color={GatiMitraColors.splashMint} />
              )
            ) : (
              <ActivityIndicator size="large" color={GatiMitraColors.splashMint} />
            )}
          </View>
        </View>

        <Text style={styles.footerHint}>
          {showExpired
            ? "QR expired"
            : "Waiting for payment confirmation from Razorpay…"}
        </Text>
        <Pressable onPress={onClose} style={styles.cancelBtn} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 17,
    color: "#111827",
  },
  amount: {
    marginTop: 4,
    textAlign: "center",
    fontFamily: StoreFonts.loraBold,
    fontSize: 28,
    color: "#111827",
  },
  hint: {
    marginTop: 4,
    marginBottom: 8,
    textAlign: "center",
    fontSize: 13,
    color: "#6B7280",
    fontFamily: StoreFonts.poppinsSemiBold,
  },
  qrStage: {
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 280,
  },
  qrViewport: {
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cropImage: {
    position: "absolute",
  },
  errBox: { paddingHorizontal: 12, alignItems: "center" },
  errText: { color: "#B91C1C", textAlign: "center", fontSize: 13 },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: GatiMitraColors.splashMint,
  },
  retryText: { color: "#fff", fontFamily: StoreFonts.poppinsBold, fontSize: 13 },
  footerHint: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 12,
    color: "#9CA3AF",
  },
  cancelBtn: {
    marginTop: 4,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 14,
    color: "#374151",
  },
});
