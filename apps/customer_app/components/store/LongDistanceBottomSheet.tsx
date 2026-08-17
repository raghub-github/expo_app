import { useEffect } from "react";
import { Modal, View, TouchableOpacity, Pressable, StyleSheet, Platform } from "react-native";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { AppAssetImage, useAppAssetUrl } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { GatiMitraColors } from "@/constants/gatimitra";
import { reloadCustomerAppAssets } from "@/store/appAssetsStore";

const POINTS: Array<{
  icon: ComponentProps<typeof Ionicons>["name"];
  text: string;
}> = [
  { icon: "time-outline", text: "Delivery may take longer than usual." },
  { icon: "thermometer-outline", text: "Food temperature may vary during the longer journey." },
  { icon: "bicycle-outline", text: "We’ll do our best to get your order to you quickly." },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function LongDistanceBottomSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const heroUrl = useAppAssetUrl(CX.store.longDistanceSheet);

  useEffect(() => {
    if (!visible) return;
    void reloadCustomerAppAssets();
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheetWrap}>
          <TouchableOpacity
            style={styles.floatingClose}
            onPress={onClose}
            hitSlop={10}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            {heroUrl ? (
              <View style={styles.heroWrap}>
                <AppAssetImage
                  assetKey={CX.store.longDistanceSheet}
                  style={styles.hero}
                  contentFit="contain"
                  accessibilityLabel="Long distance delivery"
                  fresh
                />
              </View>
            ) : null}

            <AppText style={styles.title}>Your food will come from far away</AppText>

            <View style={styles.points}>
              {POINTS.map((row) => (
                <View key={row.text} style={styles.pointRow}>
                  <View style={styles.pointIcon}>
                    <Ionicons name={row.icon} size={16} color={GatiMitraColors.deepMintStart} />
                  </View>
                  <AppText style={styles.pointText}>{row.text}</AppText>
                </View>
              ))}
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.ctaPress, pressed && styles.ctaPressed]}
              accessibilityRole="button"
              accessibilityLabel="Okay, got it!"
            >
              <LinearGradient
                colors={GatiMitraColors.checkoutGradient}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.cta}
              >
                <AppText style={styles.ctaText}>Okay, got it!</AppText>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    width: "100%",
    alignItems: "center",
  },
  floatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  heroWrap: {
    width: "100%",
    height: 132,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    width: "100%",
    height: "100%",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.3,
    lineHeight: 28,
    marginBottom: 18,
  },
  points: {
    gap: 14,
    marginBottom: 22,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  pointIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  pointText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
    lineHeight: 22,
  },
  ctaPress: {
    borderRadius: 12,
    overflow: "hidden",
  },
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  cta: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
