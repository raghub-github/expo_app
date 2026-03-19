import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ImageBackground,
  Dimensions,
  Animated,
  ImageSourcePropType,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraMerchant, BUTTON_RADIUS, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { getConfig } from "@/config/env";

const { width, height } = Dimensions.get("window");
const SLIDE_INTERVAL_MS = 4000;
const BOTTOM_SECTION_HEIGHT = 140;
const TOTAL_IMAGES = 6;

// First cover: wlcm.png only (from assets — do not use logo.png or onlylogo.png)
const FIRST_IMAGE_SOURCE: ImageSourcePropType = require("../../assets/wlcm.png");

// Remaining 5: all store types (food, retail, grocery, pharmacy, general)
const REMOTE_IMAGES = [
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
  "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800",
  "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=800",
  "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800",
  "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800",
];

function getBackgroundSource(index: number): ImageSourcePropType {
  if (index === 0) return FIRST_IMAGE_SOURCE;
  return { uri: REMOTE_IMAGES[index - 1] };
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const loginScale = useRef(new Animated.Value(1)).current;
  const signupScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % TOTAL_IMAGES);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const animatePressIn = (anim: Animated.Value) => {
    Animated.spring(anim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const animatePressOut = (anim: Animated.Value) => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 8,
    }).start();
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, SAFE_AREA_TOP_MIN) }]}>
      <ImageBackground
        source={getBackgroundSource(currentIndex)}
        style={styles.background}
        resizeMode="cover"
      >
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.8)"]}
          style={styles.gradient}
        />
        <View style={styles.overlay}>
          <Text style={styles.logo}>GatiMitra</Text>
          <Text style={styles.subtitle}>STORES PARTNER</Text>
          <Text style={styles.tagline}>
            Your orders, your catalog — all in one place
          </Text>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_IMAGES }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>
      </ImageBackground>

      <View style={styles.buttons}>
        <Animated.View style={{ transform: [{ scale: loginScale }] }}>
          <Pressable
            onPressIn={() => animatePressIn(loginScale)}
            onPressOut={() => animatePressOut(loginScale)}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.btnPressedOpacity,
            ]}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.primaryBtnText}>Login</Text>
          </Pressable>
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: signupScale }] }}>
          <Pressable
            onPressIn={() => animatePressIn(signupScale)}
            onPressOut={() => animatePressOut(signupScale)}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.btnPressedOpacity,
            ]}
            onPress={() => router.push("/(auth)/signup-webview")}
          >
            <Text style={styles.secondaryBtnText}>Join as Partner</Text>
          </Pressable>
        </Animated.View>

        <View style={styles.agreement}>
          <Text style={styles.agreementLine1}>By continuing, you agree to our</Text>
          <View style={styles.agreementLinks}>
            <Pressable
              onPress={() => Linking.openURL(`${getConfig().storeWebBaseUrl}/terms`).catch(() => {})}
              style={({ pressed }) => [pressed && styles.agreementLinkPressed]}
            >
              <Text style={styles.agreementLink}>Terms of service</Text>
            </Pressable>
            <Text style={styles.agreementSeparator}>|</Text>
            <Pressable
              onPress={() => Linking.openURL(`${getConfig().storeWebBaseUrl}/privacy`).catch(() => {})}
              style={({ pressed }) => [pressed && styles.agreementLinkPressed]}
            >
              <Text style={styles.agreementLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.agreementSeparator}>|</Text>
            <Pressable
              onPress={() => Linking.openURL(`${getConfig().storeWebBaseUrl}/code-of-conduct`).catch(() => {})}
              style={({ pressed }) => [pressed && styles.agreementLinkPressed]}
            >
              <Text style={styles.agreementLink}>Code of Conduct</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
  background: {
    flex: 1,
    width,
    height: height - BOTTOM_SECTION_HEIGHT,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  logo: {
    fontSize: 32,
    fontWeight: "700",
    color: GatiMitraMerchant.primaryLight,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 2,
    marginTop: 4,
  },
  tagline: {
    fontSize: 16,
    color: "rgba(255,255,255,0.92)",
    marginTop: 12,
    lineHeight: 22,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    marginTop: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: GatiMitraMerchant.primaryLight,
    width: 10,
    height: 8,
    borderRadius: 4,
  },
  buttons: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    backgroundColor: GatiMitraMerchant.background,
    gap: 12,
  },
  agreement: {
    alignItems: "center",
    marginTop: 8,
  },
  agreementLine1: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  agreementLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 4,
  },
  agreementLink: {
    fontSize: 13,
    color: GatiMitraMerchant.primary,
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
  },
  agreementSeparator: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  agreementLinkPressed: {
    opacity: 0.7,
  },
  primaryBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 16,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    backgroundColor: GatiMitraMerchant.background,
    paddingVertical: 16,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: GatiMitraMerchant.primaryDark,
  },
  secondaryBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.primaryDark,
    letterSpacing: 0.5,
  },
  btnPressedOpacity: {
    opacity: 0.88,
  },
});
