import { useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, Dimensions, Animated, Linking } from "react-native";
import { Image } from "expo-image";
import { useRouter, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraMerchant, BUTTON_RADIUS, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { getPartnerLegalUrls } from "@/lib/partnerLegalUrls";
import { useAppAssetUrl, getAppAssetDownloadUrl } from "@/store/appAssetsStore";
import { MX_WELCOME_SLIDE_KEYS } from "@/lib/appAssetKeys";
import { prefetchWelcomeUris } from "@/lib/welcomeCriticalAssets";
import {
  ensureWelcomeSlideLocal,
  peekWelcomeSlideLocalUri,
  warmWelcomeSlidesLocal,
} from "@/lib/welcomeImageDiskCache";
import { useAuth } from "@/context/AuthContext";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

const { width, height } = Dimensions.get("window");
const SLIDE_INTERVAL_MS = 4000;
const BOTTOM_SECTION_HEIGHT = 140;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const slide0 = useAppAssetUrl(MX_WELCOME_SLIDE_KEYS[0]);
  const slide1 = useAppAssetUrl(MX_WELCOME_SLIDE_KEYS[1]);
  const slide2 = useAppAssetUrl(MX_WELCOME_SLIDE_KEYS[2]);
  const slide3 = useAppAssetUrl(MX_WELCOME_SLIDE_KEYS[3]);
  const slide4 = useAppAssetUrl(MX_WELCOME_SLIDE_KEYS[4]);
  const slide5 = useAppAssetUrl(MX_WELCOME_SLIDE_KEYS[5]);
  const remoteByKey = useMemo(
    () =>
      [
        [MX_WELCOME_SLIDE_KEYS[0], slide0],
        [MX_WELCOME_SLIDE_KEYS[1], slide1],
        [MX_WELCOME_SLIDE_KEYS[2], slide2],
        [MX_WELCOME_SLIDE_KEYS[3], slide3],
        [MX_WELCOME_SLIDE_KEYS[4], slide4],
        [MX_WELCOME_SLIDE_KEYS[5], slide5],
      ] as const,
    [slide0, slide1, slide2, slide3, slide4, slide5]
  );
  const slides = useMemo(
    () =>
      remoteByKey.flatMap(([assetKey, remoteUrl]) =>
        remoteUrl ? [{ assetKey, remoteUrl }] : []
      ),
    [remoteByKey]
  );
  const [localByKey, setLocalByKey] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const loginScale = useRef(new Animated.Value(1)).current;
  const signupScale = useRef(new Animated.Value(1)).current;

  const slideCount = slides.length;

  useEffect(() => {
    if (slides.length === 0) return;
    prefetchWelcomeUris(slides.map((s) => s.remoteUrl));
    warmWelcomeSlidesLocal(
      slides.map((s) => ({
        assetKey: s.assetKey,
        url: getAppAssetDownloadUrl(s.assetKey) ?? s.remoteUrl,
      }))
    );
    let cancelled = false;
    void (async () => {
      for (const slide of slides) {
        const local = await ensureWelcomeSlideLocal(
          slide.assetKey,
          getAppAssetDownloadUrl(slide.assetKey) ?? slide.remoteUrl
        );
        if (cancelled || !local) continue;
        setLocalByKey((prev) =>
          prev[slide.assetKey] === local ? prev : { ...prev, [slide.assetKey]: local }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slides]);

  useEffect(() => {
    if (slideCount <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slideCount);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [slideCount]);

  useEffect(() => {
    if (currentIndex >= slideCount && slideCount > 0) setCurrentIndex(0);
  }, [currentIndex, slideCount]);

  const active = slideCount > 0 ? slides[currentIndex] ?? slides[0] : null;
  const backgroundUri = active
    ? localByKey[active.assetKey] ??
      peekWelcomeSlideLocalUri(active.assetKey) ??
      active.remoteUrl
    : null;

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

  const legalUrls = getPartnerLegalUrls();

  if (authState.status === "loading") {
    return <MerchantBootstrapScreen />;
  }
  if (authState.status === "authenticated") {
    return <Redirect href="/" />;
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, SAFE_AREA_TOP_MIN) }]}>
      <View style={[styles.background, !backgroundUri && styles.backgroundFallback]}>
        {backgroundUri ? (
          <Image
            source={{ uri: backgroundUri }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={active?.assetKey ?? `welcome-${currentIndex}`}
            transition={0}
            priority="high"
          />
        ) : null}
        {/* Keep next slides warm in disk/memory cache while current slide shows. */}
        {slides.map((slide, i) =>
          i === currentIndex ? null : (
            <Image
              key={slide.assetKey}
              source={{
                uri:
                  localByKey[slide.assetKey] ??
                  peekWelcomeSlideLocalUri(slide.assetKey) ??
                  slide.remoteUrl,
              }}
              style={styles.offscreenPrefetch}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={slide.assetKey}
              transition={0}
            />
          )
        )}
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
          {slideCount > 1 ? (
            <View style={styles.dots}>
              {slides.map((slide, i) => (
                <View
                  key={slide.assetKey}
                  style={[styles.dot, i === currentIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>

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
              onPress={() => Linking.openURL(legalUrls.terms).catch(() => {})}
              style={({ pressed }) => [pressed && styles.agreementLinkPressed]}
            >
              <Text style={styles.agreementLink}>Terms of service</Text>
            </Pressable>
            <Text style={styles.agreementSeparator}>|</Text>
            <Pressable
              onPress={() => Linking.openURL(legalUrls.privacyPolicy).catch(() => {})}
              style={({ pressed }) => [pressed && styles.agreementLinkPressed]}
            >
              <Text style={styles.agreementLink}>Privacy Policy</Text>
            </Pressable>
            <Text style={styles.agreementSeparator}>|</Text>
            <Pressable
              onPress={() => Linking.openURL(legalUrls.codeOfConduct).catch(() => {})}
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
    overflow: "hidden",
  },
  backgroundFallback: {
    backgroundColor: "#1a3d34",
  },
  offscreenPrefetch: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
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
