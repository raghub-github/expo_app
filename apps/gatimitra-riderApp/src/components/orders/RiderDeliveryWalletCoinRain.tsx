import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Platform, InteractionManager } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
  type SharedValue,
} from "react-native-reanimated";

const COIN_COUNT = 14;
const COIN_SIZE = 34;
const COIN_STAGGER_MS = 95;
const COIN_TRAVEL_MS = 1250;
const COIN_WOBBLE_PX = 14;
const COIN_ARC_PX = 52;
const MAX_MEASURE_ATTEMPTS = 12;
const COIN_ANIM_START_DELAY_MS = 420;
const COINS_COMPLETE_MS =
  COIN_ANIM_START_DELAY_MS + (COIN_COUNT - 1) * COIN_STAGGER_MS + COIN_TRAVEL_MS + 260;

type CoinPath = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type Props = {
  amountAnchorRef: React.RefObject<View | null>;
  pocketAnchorRef: React.RefObject<View | null>;
  pocketPulse: SharedValue<number>;
  onCoinsComplete?: () => void;
};

function GoldCoinFace({ size, symbolSize }: { size: number; symbolSize: number }) {
  const radius = size / 2;
  const inner = size - 6;

  return (
    <View style={[styles.coinOuter, { width: size, height: size, borderRadius: radius }]}>
      <LinearGradient
        colors={["#78350F", "#B45309", "#F59E0B", "#B45309", "#78350F"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.coinRim, { width: size, height: size, borderRadius: radius }]}
      >
        <LinearGradient
          colors={["#FEF9C3", "#FDE047", "#F59E0B", "#CA8A04", "#A16207"]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[
            styles.coinFace,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <View
            style={[
              styles.coinInnerRing,
              { width: inner - 5, height: inner - 5, borderRadius: (inner - 5) / 2 },
            ]}
          />
          <LinearGradient
            colors={["rgba(255,255,255,0.72)", "rgba(255,255,255,0.08)", "transparent"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.7, y: 0.65 }}
            style={[styles.coinShine, { borderRadius: inner / 2 }]}
          />
          <View style={[styles.coinGlint, { width: inner * 0.28, height: inner * 0.14 }]} />
          <Text style={[styles.coinSymbol, { fontSize: symbolSize }]}>₹</Text>
        </LinearGradient>
      </LinearGradient>
    </View>
  );
}

function FlyingCoin({
  index,
  path,
  wobbleDir,
  sizeScale,
  startSpreadX,
  startSpreadY,
}: {
  index: number;
  path: CoinPath;
  wobbleDir: number;
  sizeScale: number;
  startSpreadX: number;
  startSpreadY: number;
}) {
  const progress = useSharedValue(0);
  const visible = useSharedValue(0);
  const size = COIN_SIZE * sizeScale;
  const symbolSize = Math.round(13 * sizeScale);

  useEffect(() => {
    const delay = COIN_ANIM_START_DELAY_MS + index * COIN_STAGGER_MS;
    visible.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 160 }),
        withDelay(COIN_TRAVEL_MS - 200, withTiming(0, { duration: 220 }))
      )
    );
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: COIN_TRAVEL_MS, easing: Easing.bezier(0.22, 0.61, 0.36, 1) })
    );
  }, [index, progress, visible]);

  const coinStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const wobble = Math.sin(t * Math.PI * 2.6) * COIN_WOBBLE_PX * wobbleDir;
    const arc = Math.sin(t * Math.PI) * -COIN_ARC_PX;
    const x =
      interpolate(t, [0, 1], [path.startX + startSpreadX, path.endX]) + wobble;
    const y =
      interpolate(t, [0, 1], [path.startY + startSpreadY, path.endY]) + arc;
    const scale = interpolate(t, [0, 0.1, 0.45, 0.92, 1], [0.35, 1.08, 1.02, 0.92, 0.55]);
    const flip = interpolate(
      t,
      [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1],
      [1, 0.12, 1, 0.1, 1, 0.14, 0.55]
    );
    const spin = interpolate(t, [0, 1], [0, 540 * wobbleDir]);
    const liftShadow = interpolate(t, [0, 0.5, 1], [0.35, 1, 0.2]);

    return {
      opacity: visible.value,
      transform: [
        { translateX: x },
        { translateY: y },
        { perspective: 900 },
        { rotateY: `${spin}deg` },
        { scaleX: flip },
        { scale: scale * sizeScale },
      ],
      shadowOpacity: liftShadow * 0.55,
    };
  });

  return (
    <Animated.View
      style={[styles.coin, { width: size, height: size, borderRadius: size / 2 }, coinStyle]}
      pointerEvents="none"
    >
      <GoldCoinFace size={size} symbolSize={symbolSize} />
    </Animated.View>
  );
}

export function RiderDeliveryWalletCoinRain({
  amountAnchorRef,
  pocketAnchorRef,
  pocketPulse,
  onCoinsComplete,
}: Props) {
  const [path, setPath] = useState<CoinPath | null>(null);
  const playedRef = useRef(false);
  const attemptsRef = useRef(0);
  const completeRef = useRef(onCoinsComplete);
  completeRef.current = onCoinsComplete;

  const coinVariants = useRef(
    Array.from({ length: COIN_COUNT }, (_, index) => ({
      sizeScale: 0.88 + (index % 5) * 0.05,
      startSpreadX: ((index % 7) - 3) * 5,
      startSpreadY: ((index % 5) - 2) * 4,
      wobbleDir: index % 2 === 0 ? 1 : -1,
    }))
  ).current;

  useEffect(() => {
    if (!path) return;
    const timer = setTimeout(() => {
      completeRef.current?.();
    }, COINS_COMPLETE_MS);
    return () => clearTimeout(timer);
  }, [path]);

  useEffect(() => {
    if (playedRef.current) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      attemptsRef.current += 1;
      if (!cancelled && attemptsRef.current < MAX_MEASURE_ATTEMPTS) {
        retryTimer = setTimeout(measure, 140);
      }
    };

    const measure = () => {
      if (playedRef.current || cancelled) return;

      const amountNode = amountAnchorRef.current;
      const pocketNode = pocketAnchorRef.current;
      if (!amountNode || !pocketNode) {
        scheduleRetry();
        return;
      }

      amountNode.measureInWindow((ax, ay, aw, ah) => {
        pocketNode.measureInWindow((px, py, pw, ph) => {
          if (cancelled) return;
          if (aw <= 0 || ah <= 0 || pw <= 0 || ph <= 0) {
            scheduleRetry();
            return;
          }

          playedRef.current = true;
          setPath({
            startX: ax + aw / 2 - COIN_SIZE / 2,
            startY: ay + ah / 2 - COIN_SIZE / 2,
            endX: px + pw / 2 - COIN_SIZE / 2,
            endY: py + ph / 2 - COIN_SIZE / 2,
          });

          pocketPulse.value = withDelay(
            900,
            withRepeat(
              withSequence(
                withTiming(1.18, { duration: 95, easing: Easing.out(Easing.ease) }),
                withTiming(1, { duration: 120, easing: Easing.inOut(Easing.ease) })
              ),
              7,
              false
            )
          );
        });
      });
    };

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        retryTimer = setTimeout(measure, 280);
      }
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [amountAnchorRef, pocketAnchorRef, pocketPulse]);

  if (!path) return null;

  return (
    <View style={styles.coinOverlay} pointerEvents="none">
      {coinVariants.map((variant, index) => (
        <FlyingCoin
          key={index}
          index={index}
          path={path}
          wobbleDir={variant.wobbleDir}
          sizeScale={variant.sizeScale}
          startSpreadX={variant.startSpreadX}
          startSpreadY={variant.startSpreadY}
        />
      ))}
    </View>
  );
}

export const riderWalletPocketStyles = StyleSheet.create({
  pocketDock: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 4,
    gap: 4,
  },
  pocketIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFBEB",
    borderWidth: 2,
    borderColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#B45309",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  pocketLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
    includeFontPadding: false,
    letterSpacing: 0.2,
  },
});

const styles = StyleSheet.create({
  coinOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
  },
  coin: {
    position: "absolute",
    left: 0,
    top: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#78350F",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 5,
      },
      android: { elevation: 10 },
    }),
  },
  coinOuter: {
    overflow: "hidden",
  },
  coinRim: {
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  coinFace: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(146,64,14,0.35)",
  },
  coinInnerRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(180,83,9,0.45)",
  },
  coinShine: {
    ...StyleSheet.absoluteFillObject,
  },
  coinGlint: {
    position: "absolute",
    top: "14%",
    left: "18%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.55)",
    transform: [{ rotate: "-24deg" }],
  },
  coinSymbol: {
    fontWeight: "900",
    color: "#78350F",
    textShadowColor: "rgba(255,251,235,0.9)",
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
    includeFontPadding: false,
    zIndex: 2,
  },
});
